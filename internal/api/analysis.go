package api

import (
	"context"
	"database/sql"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/beabzk/zer/internal/lineage"
)

func (d Deps) handleKinship(w http.ResponseWriter, r *http.Request) {
	a := r.URL.Query().Get("person_a")
	b := r.URL.Query().Get("person_b")
	if a == "" || b == "" {
		writeError(w, http.StatusBadRequest, "person_a and person_b are required")
		return
	}
	db, _, ok := treeDB(w, r, d)
	if !ok {
		return
	}
	result, err := lineage.FindKinship(r.Context(), db, a, b)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// lineageNodeBudget bounds one lineage response. Near generations fill first,
// so a truncated response still carries the closest relatives. The client
// shows the truncation notice reported alongside the returned nodes.
const lineageNodeBudget = 80

// PersonSummary is the compact per-person payload shared by graph and lineage
// responses. Full names are synthesized from parent edges at request time.
type PersonSummary struct {
	FullNative  string `json:"full_native"`
	FullLatin   string `json:"full_latin"`
	Gender      string `json:"gender"`
	BirthYearEC *int   `json:"birth_year_ec"`
	DeathYearEC *int   `json:"death_year_ec"`
	IsDeceased  bool   `json:"is_deceased"`
}

// summarizePerson loads the display fields for one individual. It reports
// false when the row is missing so callers can skip the node.
func summarizePerson(ctx context.Context, db *sql.DB, id string) (PersonSummary, bool) {
	var gender string
	var birthYear, deathYear *int
	var deceased int
	if err := db.QueryRowContext(ctx,
		`SELECT gender, birth_year_ec, death_year_ec, is_deceased FROM individuals WHERE id = ?`,
		id).Scan(&gender, &birthYear, &deathYear, &deceased); err != nil {
		return PersonSummary{}, false
	}
	native, _ := lineage.SynthesizeFullName(ctx, db, id, 3, lineage.ScriptNative, false)
	latin, _ := lineage.SynthesizeFullName(ctx, db, id, 3, lineage.ScriptLatin, false)
	return PersonSummary{
		FullNative: native, FullLatin: latin, Gender: gender,
		BirthYearEC: birthYear, DeathYearEC: deathYear, IsDeceased: deceased == 1,
	}, true
}

// lineageNode is one occurrence on the pedigree. The same individual can
// appear more than once when several paths reach them; Path identifies the
// occurrence and its consecutive IDs drive the connectors.
type lineageNode struct {
	ID    string   `json:"id"`
	Depth int      `json:"depth"`
	Path  []string `json:"path"`
	PersonSummary
}

// lineageUnion links two partners that both appear in the response so the
// client can place and connect them as a couple.
type lineageUnion struct {
	ID     string `json:"id"`
	Source string `json:"source"`
	Target string `json:"target"`
}

func containsID(path []string, id string) bool {
	for _, step := range path {
		if step == id {
			return true
		}
	}
	return false
}

// collectLineageUnions returns every union whose partners are both present in
// the response. Unions involving absent people cannot be drawn.
func collectLineageUnions(ctx context.Context, db *sql.DB, nodes []lineageNode) []lineageUnion {
	present := make(map[string]bool, len(nodes))
	for _, node := range nodes {
		present[node.ID] = true
	}
	out := []lineageUnion{}
	rows, err := db.QueryContext(ctx, `SELECT id, partner_a_id, partner_b_id FROM unions`)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var id, a, b string
		if err := rows.Scan(&id, &a, &b); err != nil {
			return out
		}
		if present[a] && present[b] {
			out = append(out, lineageUnion{ID: id, Source: a, Target: b})
		}
	}
	return out
}

func (d Deps) handleLineage(w http.ResponseWriter, r *http.Request) {
	direction := r.URL.Query().Get("direction")
	if direction == "" {
		direction = "ancestors"
	}
	if direction != "ancestors" && direction != "descendants" {
		writeError(w, http.StatusBadRequest, "direction must be ancestors or descendants")
		return
	}
	depth := queryDepth(r, 10)
	root := chi.URLParam(r, "id")
	db, _, ok := treeDB(w, r, d)
	if !ok {
		return
	}
	rootSummary, ok := summarizePerson(r.Context(), db, root)
	if !ok {
		writeError(w, http.StatusNotFound, "individual not found")
		return
	}
	nodes := []lineageNode{{ID: root, Depth: 0, Path: []string{root}, PersonSummary: rootSummary}}
	frontier := []lineageNode{nodes[0]}
	column := "parent_id"
	matchCol := "child_id"
	if direction == "descendants" {
		column, matchCol = "child_id", "parent_id"
	}
	// Cycles are broken per path, not globally: an ancestor reached through two
	// distinct paths stays visible as two occurrences.
	truncated := false
	for level := 1; level <= depth && len(frontier) > 0 && !truncated; level++ {
		var next []lineageNode
		for _, n := range frontier {
			rows, err := db.QueryContext(r.Context(),
				`SELECT `+column+` FROM parent_child WHERE `+matchCol+` = ?`, n.ID)
			if err != nil {
				writeInternalError(w, r, err)
				return
			}
			var ids []string
			for rows.Next() {
				var id string
				if err := rows.Scan(&id); err != nil {
					rows.Close()
					writeInternalError(w, r, err)
					return
				}
				ids = append(ids, id)
			}
			rows.Close()
			for _, id := range ids {
				if containsID(n.Path, id) {
					continue
				}
				summary, ok := summarizePerson(r.Context(), db, id)
				if !ok {
					continue
				}
				path := make([]string, 0, len(n.Path)+1)
				path = append(path, n.Path...)
				path = append(path, id)
				node := lineageNode{ID: id, Depth: level, Path: path, PersonSummary: summary}
				nodes = append(nodes, node)
				next = append(next, node)
				if len(nodes) > lineageNodeBudget {
					nodes = nodes[:lineageNodeBudget]
					truncated = true
					break
				}
			}
			if truncated {
				break
			}
		}
		frontier = next
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"root_id": root, "direction": direction, "depth": depth,
		"truncated": truncated, "nodes": nodes,
		"unions": collectLineageUnions(r.Context(), db, nodes),
	})
}

type flowNode struct {
	ID   string         `json:"id"`
	Data map[string]any `json:"data"`
}

type flowEdge struct {
	ID     string `json:"id"`
	Source string `json:"source"`
	Target string `json:"target"`
	Label  string `json:"label"`
}

func (d Deps) handleSubgraph(w http.ResponseWriter, r *http.Request) {
	root := r.URL.Query().Get("root_id")
	if root == "" {
		writeError(w, http.StatusBadRequest, "root_id is required")
		return
	}
	depth := queryDepth(r, 4)
	db, _, ok := treeDB(w, r, d)
	if !ok {
		return
	}
	if !individualExists(r, db, root) {
		writeError(w, http.StatusNotFound, "individual not found")
		return
	}
	visited := map[string]bool{root: true}
	frontier := []string{root}
	for level := 0; level < depth && len(frontier) > 0; level++ {
		var next []string
		for _, id := range frontier {
			for _, q := range []string{
				`SELECT parent_id FROM parent_child WHERE child_id = ?`,
				`SELECT child_id FROM parent_child WHERE parent_id = ?`,
			} {
				rows, err := db.QueryContext(r.Context(), q, id)
				if err != nil {
					writeInternalError(w, r, err)
					return
				}
				for rows.Next() {
					var other string
					if err := rows.Scan(&other); err != nil {
						rows.Close()
						writeInternalError(w, r, err)
						return
					}
					if !visited[other] {
						visited[other] = true
						next = append(next, other)
					}
				}
				rows.Close()
			}
			unionRows, err := db.QueryContext(r.Context(),
				`SELECT partner_a_id, partner_b_id FROM unions WHERE partner_a_id = ? OR partner_b_id = ?`, id, id)
			if err != nil {
				writeInternalError(w, r, err)
				return
			}
			for unionRows.Next() {
				var a, b string
				if err := unionRows.Scan(&a, &b); err != nil {
					unionRows.Close()
					writeInternalError(w, r, err)
					return
				}
				other := a
				if other == id {
					other = b
				}
				if !visited[other] {
					visited[other] = true
					next = append(next, other)
				}
			}
			unionRows.Close()
		}
		frontier = next
	}

	nodes := []flowNode{}
	for id := range visited {
		var native, latin, gender string
		var birthYear, deathYear *int
		var deceased int
		if err := db.QueryRowContext(r.Context(),
			`SELECT given_name_native, given_name_latin, gender,
				birth_year_ec, death_year_ec, is_deceased
			FROM individuals WHERE id = ?`,
			id).Scan(&native, &latin, &gender, &birthYear, &deathYear, &deceased); err != nil {
			continue
		}
		fullNative, _ := lineage.SynthesizeFullName(r.Context(), db, id, 3, lineage.ScriptNative, false)
		fullLatin, _ := lineage.SynthesizeFullName(r.Context(), db, id, 3, lineage.ScriptLatin, false)
		nodes = append(nodes, flowNode{ID: id, Data: map[string]any{
			"given_name_native": native, "given_name_latin": latin, "gender": gender,
			"full_native": fullNative, "full_latin": fullLatin,
			"birth_year_ec": birthYear, "death_year_ec": deathYear,
			"is_deceased": deceased == 1,
		}})
	}
	edges := []flowEdge{}
	collect := func(query, label string) {
		rows, err := db.QueryContext(r.Context(), query)
		if err != nil {
			return
		}
		defer rows.Close()
		for rows.Next() {
			var edgeID, source, target string
			if err := rows.Scan(&edgeID, &source, &target); err != nil {
				return
			}
			if visited[source] && visited[target] {
				edges = append(edges, flowEdge{ID: edgeID, Source: source, Target: target, Label: label})
			}
		}
	}
	collect(`SELECT id, parent_id, child_id FROM parent_child`, "parent")
	collect(`SELECT id, partner_a_id, partner_b_id FROM unions`, "union")

	writeJSON(w, http.StatusOK, map[string]any{"nodes": nodes, "edges": edges})
}

func individualExists(r *http.Request, db *sql.DB, id string) bool {
	var count int
	if err := db.QueryRowContext(r.Context(),
		`SELECT COUNT(*) FROM individuals WHERE id = ?`, id).Scan(&count); err != nil {
		return false
	}
	return count > 0
}
