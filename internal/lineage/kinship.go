package lineage

import (
	"container/list"
	"context"
	"database/sql"
	"fmt"
	"strings"
)

// Relation labels for kinship segments. Labels stay neutral: the graph
// records parentage and partnership, callers interpret cultural meaning.
const (
	RelationParent = "PARENT"
	RelationChild  = "CHILD"
	RelationSpouse = "SPOUSE"
)

// KinshipSegment is one hop in a kinship path.
type KinshipSegment struct {
	FromID           string `json:"from_id"`
	ToID             string `json:"to_id"`
	Relation         string `json:"relation"`
	RelationshipType string `json:"relationship_type,omitempty"`
	IsNameSource     *bool  `json:"is_name_source,omitempty"`
	UnionType        string `json:"union_type,omitempty"`
	UnionStatus      string `json:"union_status,omitempty"`
}

// KinshipPerson is the selector-shaped record for a path participant.
type KinshipPerson struct {
	ID         string `json:"id"`
	FullNative string `json:"full_native"`
	FullLatin  string `json:"full_latin"`
	Gender     string `json:"gender"`
}

// KinshipResult is the shortest path between two individuals across any
// number of generations.
type KinshipResult struct {
	PathKey        string                   `json:"path_key"`
	Segments       []KinshipSegment         `json:"segments"`
	DegreesOfSep   int                      `json:"degrees_of_sep"`
	Individuals    map[string]KinshipPerson `json:"individuals"`
	Term           KinshipTerm              `json:"term"`
	SecondaryTerms []KinshipTerm            `json:"secondary_terms,omitempty"`
}

// FindKinship returns the shortest undirected path between two people using
// parent, child, and union edges. It reports an error when no path exists.
func FindKinship(ctx context.Context, db *sql.DB, startID, targetID string) (*KinshipResult, error) {
	if startID == targetID {
		person, err := kinshipPerson(ctx, db, startID)
		if err != nil {
			return nil, err
		}
		return &KinshipResult{
			PathKey:      "self",
			DegreesOfSep: 0,
			Individuals:  map[string]KinshipPerson{startID: person},
			Term: classifyKinshipTerm(nil, kinshipFacts{
				targetGender: person.Gender,
				people:       map[string]KinshipPerson{startID: person},
			}),
		}, nil
	}

	path, found, err := findKinshipPath(ctx, db, startID, targetID, true)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, fmt.Errorf("no relationship path between %s and %s", startID, targetID)
	}

	keys := make([]string, 0, len(path))
	for _, segment := range path {
		keys = append(keys, strings.ToLower(segment.Relation))
	}
	people, err := kinshipPeople(ctx, db, path)
	if err != nil {
		return nil, err
	}
	parentsByPerson, err := kinshipParentsForPath(ctx, db, path)
	if err != nil {
		return nil, err
	}
	parentsA := parentsByPerson[startID]
	parentsB := parentsByPerson[targetID]
	parentUnion, err := kinshipParentUnion(ctx, db, parentsA, parentsB)
	if err != nil {
		return nil, err
	}
	secondaryTerms, err := secondaryKinshipTerms(ctx, db, startID, targetID, path)
	if err != nil {
		return nil, err
	}

	return &KinshipResult{
		PathKey:      strings.Join(keys, "."),
		Segments:     path,
		DegreesOfSep: len(path),
		Individuals:  people,
		Term: classifyKinshipTerm(path, kinshipFacts{
			targetGender:    people[targetID].Gender,
			parentsA:        parentsA,
			parentsB:        parentsB,
			parentsByPerson: parentsByPerson,
			people:          people,
			parentUnion:     parentUnion,
		}),
		SecondaryTerms: secondaryTerms,
	}, nil
}

func findKinshipPath(
	ctx context.Context,
	db *sql.DB,
	startID string,
	targetID string,
	includeSpouses bool,
) ([]KinshipSegment, bool, error) {
	type queueNode struct {
		id   string
		path []KinshipSegment
	}
	queue := list.New()
	queue.PushBack(queueNode{id: startID})
	visited := map[string]bool{startID: true}

	for queue.Len() > 0 {
		curr := queue.Remove(queue.Front()).(queueNode)
		if curr.id == targetID {
			return curr.path, true, nil
		}
		neighbors, err := graphNeighbors(ctx, db, curr.id)
		if err != nil {
			return nil, false, err
		}
		for _, n := range neighbors {
			if !includeSpouses && n.Relation == RelationSpouse {
				continue
			}
			if visited[n.ToID] {
				continue
			}
			visited[n.ToID] = true
			nextPath := make([]KinshipSegment, 0, len(curr.path)+1)
			nextPath = append(nextPath, curr.path...)
			nextPath = append(nextPath, n)
			queue.PushBack(queueNode{id: n.ToID, path: nextPath})
		}
	}
	return nil, false, nil
}

func secondaryKinshipTerms(
	ctx context.Context,
	db *sql.DB,
	startID string,
	targetID string,
	primaryPath []KinshipSegment,
) ([]KinshipTerm, error) {
	if len(primaryPath) != 1 || primaryPath[0].Relation != RelationSpouse {
		return nil, nil
	}
	bloodPath, found, err := findKinshipPath(ctx, db, startID, targetID, false)
	if err != nil || !found {
		return nil, err
	}
	people, err := kinshipPeople(ctx, db, bloodPath)
	if err != nil {
		return nil, err
	}
	parentsByPerson, err := kinshipParentsForPath(ctx, db, bloodPath)
	if err != nil {
		return nil, err
	}
	parentsA := parentsByPerson[startID]
	parentsB := parentsByPerson[targetID]
	parentUnion, err := kinshipParentUnion(ctx, db, parentsA, parentsB)
	if err != nil {
		return nil, err
	}
	return []KinshipTerm{classifyKinshipTerm(bloodPath, kinshipFacts{
		targetGender:    people[targetID].Gender,
		parentsA:        parentsA,
		parentsB:        parentsB,
		parentsByPerson: parentsByPerson,
		people:          people,
		parentUnion:     parentUnion,
	})}, nil
}

func graphNeighbors(ctx context.Context, db *sql.DB, id string) ([]KinshipSegment, error) {
	var out []KinshipSegment

	parentRows, err := db.QueryContext(ctx,
		`SELECT parent_id, relationship_type, is_name_source
		FROM parent_child WHERE child_id = ?`, id)
	if err != nil {
		return nil, err
	}
	defer parentRows.Close()
	for parentRows.Next() {
		var parentID, relationshipType string
		var nameSource int
		if err := parentRows.Scan(&parentID, &relationshipType, &nameSource); err != nil {
			return nil, err
		}
		isNameSource := nameSource == 1
		out = append(out, KinshipSegment{
			FromID: id, ToID: parentID, Relation: RelationParent,
			RelationshipType: relationshipType, IsNameSource: &isNameSource,
		})
	}
	if err := parentRows.Err(); err != nil {
		return nil, err
	}

	childRows, err := db.QueryContext(ctx,
		`SELECT child_id, relationship_type, is_name_source
		FROM parent_child WHERE parent_id = ?`, id)
	if err != nil {
		return nil, err
	}
	defer childRows.Close()
	for childRows.Next() {
		var childID, relationshipType string
		var nameSource int
		if err := childRows.Scan(&childID, &relationshipType, &nameSource); err != nil {
			return nil, err
		}
		isNameSource := nameSource == 1
		out = append(out, KinshipSegment{
			FromID: id, ToID: childID, Relation: RelationChild,
			RelationshipType: relationshipType, IsNameSource: &isNameSource,
		})
	}
	if err := childRows.Err(); err != nil {
		return nil, err
	}

	unionRows, err := db.QueryContext(ctx,
		`SELECT partner_a_id, partner_b_id, union_type, status
		FROM unions WHERE partner_a_id = ? OR partner_b_id = ?`, id, id)
	if err != nil {
		return nil, fmt.Errorf("read unions: %w", err)
	}
	defer unionRows.Close()
	for unionRows.Next() {
		var partnerA, partnerB, unionType, status string
		if err := unionRows.Scan(&partnerA, &partnerB, &unionType, &status); err != nil {
			return nil, err
		}
		other := partnerA
		if other == id {
			other = partnerB
		}
		out = append(out, KinshipSegment{
			FromID: id, ToID: other, Relation: RelationSpouse,
			UnionType: unionType, UnionStatus: status,
		})
	}
	if err := unionRows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

func kinshipPeople(ctx context.Context, db *sql.DB, path []KinshipSegment) (map[string]KinshipPerson, error) {
	ids := make(map[string]bool)
	for _, segment := range path {
		ids[segment.FromID] = true
		ids[segment.ToID] = true
	}
	people := make(map[string]KinshipPerson, len(ids))
	for id := range ids {
		person, err := kinshipPerson(ctx, db, id)
		if err != nil {
			return nil, err
		}
		people[id] = person
	}
	return people, nil
}

func kinshipParentsForPath(
	ctx context.Context,
	db *sql.DB,
	path []KinshipSegment,
) (map[string][]kinshipParent, error) {
	ids := make(map[string]bool)
	for _, segment := range path {
		ids[segment.FromID] = true
		ids[segment.ToID] = true
	}
	parents := make(map[string][]kinshipParent, len(ids))
	if len(ids) == 0 {
		return parents, nil
	}

	args := make([]any, 0, len(ids))
	for id := range ids {
		args = append(args, id)
	}
	placeholders := strings.TrimSuffix(strings.Repeat("?,", len(ids)), ",")
	rows, err := db.QueryContext(ctx,
		`SELECT child_id, parent_id, relationship_type
		FROM parent_child WHERE child_id IN (`+placeholders+`)`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var childID string
		var parent kinshipParent
		if err := rows.Scan(&childID, &parent.ID, &parent.RelationshipType); err != nil {
			return nil, err
		}
		parents[childID] = append(parents[childID], parent)
	}
	return parents, rows.Err()
}

func kinshipParentUnion(
	ctx context.Context,
	db *sql.DB,
	parentsA []kinshipParent,
	parentsB []kinshipParent,
) (*kinshipUnion, error) {
	parentsBIDs := make(map[string]bool, len(parentsB))
	for _, parent := range parentsB {
		parentsBIDs[parent.ID] = true
	}
	var best *kinshipUnion
	bestRank := 4
	for _, parent := range parentsA {
		rows, err := db.QueryContext(ctx,
			`SELECT partner_a_id, partner_b_id, union_type, status
			FROM unions WHERE partner_a_id = ? OR partner_b_id = ?`,
			parent.ID, parent.ID)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var partnerA, partnerB, unionType, status string
			if err := rows.Scan(&partnerA, &partnerB, &unionType, &status); err != nil {
				rows.Close()
				return nil, err
			}
			other := partnerA
			if other == parent.ID {
				other = partnerB
			}
			if !parentsBIDs[other] {
				continue
			}
			candidate := &kinshipUnion{Type: unionType, Status: status}
			rank := unionStatusRank(status)
			if rank < bestRank {
				best = candidate
				bestRank = rank
			}
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return nil, err
		}
		rows.Close()
	}
	return best, nil
}

func unionStatusRank(status string) int {
	switch status {
	case "ACTIVE":
		return 0
	case "WIDOWED":
		return 1
	case "DISSOLVED":
		return 2
	default:
		return 3
	}
}

func queryIDs(ctx context.Context, db *sql.DB, query, id string) ([]string, error) {
	rows, err := db.QueryContext(ctx, query, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var value string
		if err := rows.Scan(&value); err != nil {
			return nil, err
		}
		out = append(out, value)
	}
	return out, rows.Err()
}

func kinshipPerson(ctx context.Context, db *sql.DB, id string) (KinshipPerson, error) {
	fullNative, err := SynthesizeFullName(ctx, db, id, 3, ScriptNative, false)
	if err != nil {
		return KinshipPerson{}, err
	}
	fullLatin, err := SynthesizeFullName(ctx, db, id, 3, ScriptLatin, false)
	if err != nil {
		return KinshipPerson{}, err
	}
	var gender string
	if err := db.QueryRowContext(ctx,
		`SELECT gender FROM individuals WHERE id = ?`, id).Scan(&gender); err != nil {
		return KinshipPerson{}, fmt.Errorf("read individual %s: %w", id, err)
	}
	return KinshipPerson{
		ID: id, FullNative: fullNative, FullLatin: fullLatin, Gender: gender,
	}, nil
}
