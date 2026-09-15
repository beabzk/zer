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
	PathKey      string                   `json:"path_key"`
	Segments     []KinshipSegment         `json:"segments"`
	DegreesOfSep int                      `json:"degrees_of_sep"`
	Individuals  map[string]KinshipPerson `json:"individuals"`
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
		}, nil
	}

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
			keys := make([]string, 0, len(curr.path))
			for _, seg := range curr.path {
				keys = append(keys, strings.ToLower(seg.Relation))
			}
			people, err := kinshipPeople(ctx, db, curr.path)
			if err != nil {
				return nil, err
			}
			return &KinshipResult{
				PathKey:      strings.Join(keys, "."),
				Segments:     curr.path,
				DegreesOfSep: len(curr.path),
				Individuals:  people,
			}, nil
		}
		neighbors, err := graphNeighbors(ctx, db, curr.id)
		if err != nil {
			return nil, err
		}
		for _, n := range neighbors {
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
	return nil, fmt.Errorf("no relationship path between %s and %s", startID, targetID)
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
