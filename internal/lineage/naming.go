// Package lineage derives names and relationships from the family graph
// at query time. The database stores only parent_child and unions rows;
// every other relation is computed here.
package lineage

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
)

// Script selects which name column the synthesizer reads.
type Script string

const (
	// ScriptNative reads given_name_native, the name in its original script.
	ScriptNative Script = "native"
	// ScriptLatin reads given_name_latin, the romanized name.
	ScriptLatin Script = "latin"
)

// SynthesizeFullName walks up parents flagged is_name_source and joins the
// given names up to depth. Depth defaults to 3 when non-positive. The walk
// stops at ancestors without a name source and never revisits a node, so
// cyclic edges terminate instead of looping.
func SynthesizeFullName(ctx context.Context, db *sql.DB, rootID string, depth int, script Script, includeTitles bool) (string, error) {
	if depth <= 0 {
		depth = 3
	}
	if script != ScriptNative && script != ScriptLatin {
		return "", fmt.Errorf("unknown script %q", script)
	}

	var names []string
	var titles []string
	visited := make(map[string]bool)
	currentID := rootID

	for i := 0; i < depth; i++ {
		if visited[currentID] {
			break
		}
		visited[currentID] = true

		var nativeName, latinName string
		var titlesJSON sql.NullString
		err := db.QueryRowContext(ctx,
			`SELECT given_name_native, given_name_latin, titles FROM individuals WHERE id = ?`,
			currentID).Scan(&nativeName, &latinName, &titlesJSON)
		if err != nil {
			if err == sql.ErrNoRows {
				break
			}
			return "", fmt.Errorf("read individual %s: %w", currentID, err)
		}

		if i == 0 && includeTitles && titlesJSON.Valid && titlesJSON.String != "" {
			var rawTitles []string
			if err := json.Unmarshal([]byte(titlesJSON.String), &rawTitles); err == nil {
				for _, t := range rawTitles {
					c := strings.TrimSpace(t)
					c = strings.Trim(c, "[]\"'")
					if c != "" {
						titles = append(titles, c)
					}
				}
			}
		}
		if script == ScriptNative {
			names = append(names, nativeName)
		} else {
			names = append(names, latinName)
		}

		var nextParentID string
		err = db.QueryRowContext(ctx,
			`SELECT parent_id FROM parent_child WHERE child_id = ? AND is_name_source = 1 LIMIT 1`,
			currentID).Scan(&nextParentID)
		if err != nil {
			break
		}
		currentID = nextParentID
	}

	fullName := strings.Join(names, " ")
	if len(titles) > 0 {
		return strings.Join(titles, " ") + " " + fullName, nil
	}
	return fullName, nil
}
