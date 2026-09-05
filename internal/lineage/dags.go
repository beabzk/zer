package lineage

import (
	"context"
	"database/sql"
	"fmt"
)

// ValidateParentLink rejects edges that would corrupt the graph: self
// parentage, duplicate edges, and links that close an ancestor cycle. It
// confirms both endpoints exist.
func ValidateParentLink(ctx context.Context, db *sql.DB, parentID, childID string) error {
	if parentID == childID {
		return fmt.Errorf("individual cannot parent itself")
	}
	for _, id := range []string{parentID, childID} {
		var count int
		if err := db.QueryRowContext(ctx,
			`SELECT COUNT(*) FROM individuals WHERE id = ?`, id).Scan(&count); err != nil {
			return fmt.Errorf("check individual %s: %w", id, err)
		}
		if count == 0 {
			return fmt.Errorf("individual %s does not exist", id)
		}
	}
	var dup int
	if err := db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM parent_child WHERE parent_id = ? AND child_id = ?`,
		parentID, childID).Scan(&dup); err != nil {
		return fmt.Errorf("check duplicate edge: %w", err)
	}
	if dup > 0 {
		return fmt.Errorf("edge %s -> %s already exists", parentID, childID)
	}
	descendant, err := isDescendant(ctx, db, childID, parentID)
	if err != nil {
		return err
	}
	if descendant {
		return fmt.Errorf("edge %s -> %s would close a cycle", parentID, childID)
	}
	return nil
}

// isDescendant reports whether target is reachable from root by following
// parent to child edges.
func isDescendant(ctx context.Context, db *sql.DB, rootID, targetID string) (bool, error) {
	visited := map[string]bool{rootID: true}
	stack := []string{rootID}
	for len(stack) > 0 {
		current := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		children, err := queryIDs(ctx, db,
			`SELECT child_id FROM parent_child WHERE parent_id = ?`, current)
		if err != nil {
			return false, fmt.Errorf("walk descendants: %w", err)
		}
		for _, child := range children {
			if child == targetID {
				return true, nil
			}
			if !visited[child] {
				visited[child] = true
				stack = append(stack, child)
			}
		}
	}
	return false, nil
}
