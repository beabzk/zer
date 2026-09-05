package api

import (
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

type lineageNode struct {
	ID    string   `json:"id"`
	Depth int      `json:"depth"`
	Path  []string `json:"path"`
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
	if !individualExists(r, db, root) {
		writeError(w, http.StatusNotFound, "individual not found")
		return
	}
	nodes := []lineageNode{{ID: root, Depth: 0, Path: []string{root}}}
	visited := map[string]bool{root: true}
	frontier := []lineageNode{nodes[0]}
	column := "parent_id"
	matchCol := "child_id"
	if direction == "descendants" {
		column, matchCol = "child_id", "parent_id"
	}
	for level := 1; level <= depth && len(frontier) > 0; level++ {
		var next []lineageNode
		for _, n := range frontier {
			rows, err := db.QueryContext(r.Context(),
				`SELECT `+column+` FROM parent_child WHERE `+matchCol+` = ?`, n.ID)
			if err != nil {
				writeError(w, http.StatusInternalServerError, "storage unavailable")
				return
			}
			var ids []string
			for rows.Next() {
				var id string
				if err := rows.Scan(&id); err != nil {
					rows.Close()
					writeError(w, http.StatusInternalServerError, "storage unavailable")
					return
				}
				ids = append(ids, id)
			}
			rows.Close()
			for _, id := range ids {
				if visited[id] {
					continue
				}
				visited[id] = true
				path := make([]string, 0, len(n.Path)+1)
				path = append(path, n.Path...)
				path = append(path, id)
				node := lineageNode{ID: id, Depth: level, Path: path}
				nodes = append(nodes, node)
				next = append(next, node)
			}
		}
		frontier = next
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"root_id": root, "direction": direction, "depth": depth, "nodes": nodes,
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
					writeError(w, http.StatusInternalServerError, "storage unavailable")
					return
				}
				for rows.Next() {
					var other string
					if err := rows.Scan(&other); err != nil {
						rows.Close()
						writeError(w, http.StatusInternalServerError, "storage unavailable")
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
				writeError(w, http.StatusInternalServerError, "storage unavailable")
				return
			}
			for unionRows.Next() {
				var a, b string
				if err := unionRows.Scan(&a, &b); err != nil {
					unionRows.Close()
					writeError(w, http.StatusInternalServerError, "storage unavailable")
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
		if err := db.QueryRowContext(r.Context(),
			`SELECT given_name_native, given_name_latin, gender FROM individuals WHERE id = ?`,
			id).Scan(&native, &latin, &gender); err != nil {
			continue
		}
		fullNative, _ := lineage.SynthesizeFullName(r.Context(), db, id, 3, lineage.ScriptNative, false)
		fullLatin, _ := lineage.SynthesizeFullName(r.Context(), db, id, 3, lineage.ScriptLatin, false)
		nodes = append(nodes, flowNode{ID: id, Data: map[string]any{
			"given_name_native": native, "given_name_latin": latin, "gender": gender,
			"full_native": fullNative, "full_latin": fullLatin,
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
