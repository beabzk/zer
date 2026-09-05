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
	FromID   string `json:"from_id"`
	ToID     string `json:"to_id"`
	Relation string `json:"relation"`
}

// KinshipResult is the shortest path between two individuals across any
// number of generations.
type KinshipResult struct {
	PathKey      string           `json:"path_key"`
	Segments     []KinshipSegment `json:"segments"`
	DegreesOfSep int              `json:"degrees_of_sep"`
}

// FindKinship returns the shortest undirected path between two people using
// parent, child, and union edges. It reports an error when no path exists.
func FindKinship(ctx context.Context, db *sql.DB, startID, targetID string) (*KinshipResult, error) {
	if startID == targetID {
		return &KinshipResult{PathKey: "self", DegreesOfSep: 0}, nil
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
			return &KinshipResult{
				PathKey:      strings.Join(keys, "."),
				Segments:     curr.path,
				DegreesOfSep: len(curr.path),
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

	parents, err := queryIDs(ctx, db, `SELECT parent_id FROM parent_child WHERE child_id = ?`, id)
	if err != nil {
		return nil, err
	}
	for _, p := range parents {
		out = append(out, KinshipSegment{FromID: id, ToID: p, Relation: RelationParent})
	}

	children, err := queryIDs(ctx, db, `SELECT child_id FROM parent_child WHERE parent_id = ?`, id)
	if err != nil {
		return nil, err
	}
	for _, c := range children {
		out = append(out, KinshipSegment{FromID: id, ToID: c, Relation: RelationChild})
	}

	rows, err := db.QueryContext(ctx,
		`SELECT partner_a_id, partner_b_id FROM unions WHERE partner_a_id = ? OR partner_b_id = ?`, id, id)
	if err != nil {
		return nil, fmt.Errorf("read unions: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var a, b string
		if err := rows.Scan(&a, &b); err != nil {
			return nil, err
		}
		other := a
		if other == id {
			other = b
		}
		out = append(out, KinshipSegment{FromID: id, ToID: other, Relation: RelationSpouse})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

func queryIDs(ctx context.Context, db *sql.DB, query, id string) ([]string, error) {
	rows, err := db.QueryContext(ctx, query, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var v string
		if err := rows.Scan(&v); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}
