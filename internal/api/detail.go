package api

import (
	"database/sql"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/beabzk/zer/internal/lineage"
)

// detailPersonEdge pairs a related person with the stored edge fields so
// the workspace can show relationship types and name-source flags.
type detailPersonEdge struct {
	ID               string `json:"id"`
	FullNative       string `json:"full_native"`
	FullLatin        string `json:"full_latin"`
	Gender           string `json:"gender"`
	RelationshipType string `json:"relationship_type"`
	IsNameSource     bool   `json:"is_name_source"`
}

type detailUnion struct {
	ID        string           `json:"id"`
	UnionType string           `json:"union_type"`
	Status    string           `json:"status"`
	Partner   detailUnionParty `json:"partner"`
}

type detailUnionParty struct {
	ID         string `json:"id"`
	FullNative string `json:"full_native"`
	FullLatin  string `json:"full_latin"`
	Gender     string `json:"gender"`
}

type detailPermissions struct {
	CanEdit   bool `json:"can_edit"`
	CanDelete bool `json:"can_delete"`
}

type detailResponse struct {
	Individual  map[string]any     `json:"individual"`
	Parents     []detailPersonEdge `json:"parents"`
	Children    []detailPersonEdge `json:"children"`
	Unions      []detailUnion      `json:"unions"`
	Events      []overviewEvent    `json:"events"`
	Permissions detailPermissions  `json:"permissions"`
}

func (d Deps) handleGetIndividualDetail(w http.ResponseWriter, r *http.Request) {
	db, m, ok := treeDB(w, r, d)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	pDepth := m.PatronymicDepth
	if pDepth <= 0 {
		pDepth = 3
	}
	depth := queryDepth(r, pDepth)
	person, err := d.fetchIndividualRow(r, db, id, depth, true)
	if err != nil {
		if err == errIndividualNotFound {
			writeError(w, http.StatusNotFound, "individual not found")
			return
		}
		writeInternalError(w, r, err)
		return
	}
	parents, err := d.detailEdges(r, db, id, depth, true)
	if err != nil {
		writeInternalError(w, r, err)
		return
	}
	children, err := d.detailEdges(r, db, id, depth, false)
	if err != nil {
		writeInternalError(w, r, err)
		return
	}
	unions, err := d.detailUnions(r, db, id, depth)
	if err != nil {
		writeInternalError(w, r, err)
		return
	}
	events, err := d.detailEvents(r, db, id, depth)
	if err != nil {
		writeInternalError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, detailResponse{
		Individual: person,
		Parents:    parents,
		Children:   children,
		Unions:     unions,
		Events:     events,
		Permissions: detailPermissions{
			CanEdit:   roleRank[m.Role] >= roleRank[RoleEditor],
			CanDelete: roleRank[m.Role] >= roleRank[RoleEditor],
		},
	})
}

// detailEdges lists parents or children of a person with edge fields.
// Names resolve after the rows close because the pool holds a single
// connection and nested queries would deadlock.
func (d Deps) detailEdges(r *http.Request, db *sql.DB, id string, depth int, parents bool) ([]detailPersonEdge, error) {
	query := `SELECT pc.relationship_type, pc.is_name_source, i.id, i.gender
		FROM parent_child pc JOIN individuals i ON i.id = pc.parent_id
		WHERE pc.child_id = ? ORDER BY i.given_name_latin, i.rowid`
	if !parents {
		query = `SELECT pc.relationship_type, pc.is_name_source, i.id, i.gender
			FROM parent_child pc JOIN individuals i ON i.id = pc.child_id
			WHERE pc.parent_id = ? ORDER BY i.given_name_latin, i.rowid`
	}
	rows, err := db.QueryContext(r.Context(), query, id)
	if err != nil {
		return nil, err
	}
	type staged struct {
		rel, personID, gender string
		nameSource            bool
	}
	var list []staged
	for rows.Next() {
		var s staged
		var flag int
		if err := rows.Scan(&s.rel, &flag, &s.personID, &s.gender); err != nil {
			rows.Close()
			return nil, err
		}
		s.nameSource = flag == 1
		list = append(list, s)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	out := []detailPersonEdge{}
	for _, s := range list {
		native, _ := lineage.SynthesizeFullName(r.Context(), db, s.personID, depth, lineage.ScriptNative, false)
		latin, _ := lineage.SynthesizeFullName(r.Context(), db, s.personID, depth, lineage.ScriptLatin, false)
		out = append(out, detailPersonEdge{
			ID: s.personID, FullNative: native, FullLatin: latin, Gender: s.gender,
			RelationshipType: s.rel, IsNameSource: s.nameSource,
		})
	}
	return out, nil
}

func (d Deps) detailUnions(r *http.Request, db *sql.DB, id string, depth int) ([]detailUnion, error) {
	rows, err := db.QueryContext(r.Context(),
		`SELECT id, union_type, status, partner_a_id, partner_b_id FROM unions
		WHERE partner_a_id = ? OR partner_b_id = ? ORDER BY rowid`, id, id)
	if err != nil {
		return nil, err
	}
	type staged struct {
		id, unionType, status, partnerID string
	}
	var list []staged
	for rows.Next() {
		var s staged
		var a, b string
		if err := rows.Scan(&s.id, &s.unionType, &s.status, &a, &b); err != nil {
			rows.Close()
			return nil, err
		}
		s.partnerID = a
		if a == id {
			s.partnerID = b
		}
		list = append(list, s)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	out := []detailUnion{}
	for _, s := range list {
		var gender string
		_ = db.QueryRowContext(r.Context(),
			`SELECT gender FROM individuals WHERE id = ?`, s.partnerID).Scan(&gender)
		native, _ := lineage.SynthesizeFullName(r.Context(), db, s.partnerID, depth, lineage.ScriptNative, false)
		latin, _ := lineage.SynthesizeFullName(r.Context(), db, s.partnerID, depth, lineage.ScriptLatin, false)
		out = append(out, detailUnion{
			ID: s.id, UnionType: s.unionType, Status: s.status,
			Partner: detailUnionParty{
				ID: s.partnerID, FullNative: native, FullLatin: latin, Gender: gender,
			},
		})
	}
	return out, nil
}

func (d Deps) detailEvents(r *http.Request, db *sql.DB, id string, depth int) ([]overviewEvent, error) {
	rows, err := db.QueryContext(r.Context(),
		`SELECT id, individual_id, event_type, event_date_gc,
			event_year_ec, event_place, description
		FROM individual_events WHERE individual_id = ? ORDER BY rowid DESC`, id)
	if err != nil {
		return nil, err
	}
	var out []overviewEvent
	for rows.Next() {
		var ev overviewEvent
		if err := rows.Scan(&ev.ID, &ev.IndividualID, &ev.EventType,
			&ev.EventDateGC, &ev.EventYearEC, &ev.EventPlace, &ev.Description); err != nil {
			rows.Close()
			return nil, err
		}
		out = append(out, ev)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if out == nil {
		out = []overviewEvent{}
	}
	native, _ := lineage.SynthesizeFullName(r.Context(), db, id, depth, lineage.ScriptNative, false)
	latin, _ := lineage.SynthesizeFullName(r.Context(), db, id, depth, lineage.ScriptLatin, false)
	for i := range out {
		out[i].FullNative, out[i].FullLatin = native, latin
	}
	return out, nil
}
