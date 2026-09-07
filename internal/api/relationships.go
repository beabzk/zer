package api

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/google/uuid"

	"github.com/beabzk/zer/internal/lineage"
)

var validRelationshipTypes = map[string]bool{"BIOLOGICAL": true, "ADOPTIVE": true, "FOSTER": true}
var validUnionTypes = map[string]bool{"TRADITIONAL": true, "RELIGIOUS": true, "CIVIL": true}
var validUnionStatuses = map[string]bool{"ACTIVE": true, "DISSOLVED": true, "WIDOWED": true}

type parentChildBody struct {
	ParentID         string `json:"parent_id"`
	ChildID          string `json:"child_id"`
	RelationshipType string `json:"relationship_type"`
	IsNameSource     bool   `json:"is_name_source"`
}

func (d Deps) handleAddParentChild(w http.ResponseWriter, r *http.Request) {
	var body parentChildBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if body.ParentID == "" || body.ChildID == "" {
		writeError(w, http.StatusBadRequest, "parent_id and child_id are required")
		return
	}
	rel := body.RelationshipType
	if rel == "" {
		rel = "BIOLOGICAL"
	}
	if !validRelationshipTypes[rel] {
		writeError(w, http.StatusBadRequest, "unknown relationship_type")
		return
	}
	db, _, ok := treeDB(w, r, d)
	if !ok {
		return
	}
	if err := lineage.ValidateParentLink(r.Context(), db, body.ParentID, body.ChildID); err != nil {
		writeError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	tx, err := db.Begin()
	if err != nil {
		writeInternalError(w, r, err)
		return
	}
	defer tx.Rollback()
	if body.IsNameSource {
		// One name source per child keeps synthesis unambiguous.
		if _, err := tx.ExecContext(r.Context(),
			`UPDATE parent_child SET is_name_source = 0 WHERE child_id = ?`, body.ChildID); err != nil {
			writeInternalError(w, r, err)
			return
		}
	}
	id := uuid.NewString()
	if _, err := tx.ExecContext(r.Context(),
		`INSERT INTO parent_child (id, parent_id, child_id, relationship_type, is_name_source)
		VALUES (?, ?, ?, ?, ?)`,
		id, body.ParentID, body.ChildID, rel, boolToInt(body.IsNameSource)); err != nil {
		writeInternalError(w, r, err)
		return
	}
	if err := tx.Commit(); err != nil {
		writeInternalError(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"id": id, "parent_id": body.ParentID, "child_id": body.ChildID,
		"relationship_type": rel, "is_name_source": body.IsNameSource,
	})
}

type updateParentChildBody struct {
	ParentID         string `json:"parent_id"`
	ChildID          string `json:"child_id"`
	RelationshipType string `json:"relationship_type"`
	IsNameSource     *bool  `json:"is_name_source"`
}

// handleUpdateParentChild changes the type or name source flag of an
// existing edge. Switching the name source clears the flag on the
// child's other edges in the same transaction.
func (d Deps) handleUpdateParentChild(w http.ResponseWriter, r *http.Request) {
	var body updateParentChildBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if body.ParentID == "" || body.ChildID == "" {
		writeError(w, http.StatusBadRequest, "parent_id and child_id are required")
		return
	}
	if body.RelationshipType != "" && !validRelationshipTypes[body.RelationshipType] {
		writeError(w, http.StatusBadRequest, "unknown relationship_type")
		return
	}
	if body.RelationshipType == "" && body.IsNameSource == nil {
		writeError(w, http.StatusBadRequest, "nothing to update")
		return
	}
	db, _, ok := treeDB(w, r, d)
	if !ok {
		return
	}
	var exists int
	if err := db.QueryRowContext(r.Context(),
		`SELECT COUNT(*) FROM parent_child WHERE parent_id = ? AND child_id = ?`,
		body.ParentID, body.ChildID).Scan(&exists); err != nil || exists == 0 {
		writeError(w, http.StatusNotFound, "edge not found")
		return
	}
	tx, err := db.Begin()
	if err != nil {
		writeInternalError(w, r, err)
		return
	}
	defer tx.Rollback()
	if body.IsNameSource != nil && *body.IsNameSource {
		if _, err := tx.ExecContext(r.Context(),
			`UPDATE parent_child SET is_name_source = 0 WHERE child_id = ?`, body.ChildID); err != nil {
			writeInternalError(w, r, err)
			return
		}
		if _, err := tx.ExecContext(r.Context(),
			`UPDATE parent_child SET is_name_source = 1 WHERE parent_id = ? AND child_id = ?`,
			body.ParentID, body.ChildID); err != nil {
			writeInternalError(w, r, err)
			return
		}
	} else if body.IsNameSource != nil {
		if _, err := tx.ExecContext(r.Context(),
			`UPDATE parent_child SET is_name_source = 0 WHERE parent_id = ? AND child_id = ?`,
			body.ParentID, body.ChildID); err != nil {
			writeInternalError(w, r, err)
			return
		}
	}
	if body.RelationshipType != "" {
		if _, err := tx.ExecContext(r.Context(),
			`UPDATE parent_child SET relationship_type = ? WHERE parent_id = ? AND child_id = ?`,
			body.RelationshipType, body.ParentID, body.ChildID); err != nil {
			writeInternalError(w, r, err)
			return
		}
	}
	if err := tx.Commit(); err != nil {
		writeInternalError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"parent_id": body.ParentID, "child_id": body.ChildID,
	})
}

type unionBody struct {
	PartnerAID string `json:"partner_a_id"`
	PartnerBID string `json:"partner_b_id"`
	UnionType  string `json:"union_type"`
	Status     string `json:"status"`
}

type updateUnionBody struct {
	PartnerAID string `json:"partner_a_id"`
	PartnerBID string `json:"partner_b_id"`
	UnionType  string `json:"union_type"`
	Status     string `json:"status"`
}

// handleUpdateUnion changes the type or status of an existing union.
// Partner order is insignificant for the lookup.
func (d Deps) handleUpdateUnion(w http.ResponseWriter, r *http.Request) {
	var body updateUnionBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if body.PartnerAID == "" || body.PartnerBID == "" {
		writeError(w, http.StatusBadRequest, "partner_a_id and partner_b_id are required")
		return
	}
	if body.UnionType != "" && !validUnionTypes[body.UnionType] {
		writeError(w, http.StatusBadRequest, "unknown union_type")
		return
	}
	if body.Status != "" && !validUnionStatuses[body.Status] {
		writeError(w, http.StatusBadRequest, "unknown status")
		return
	}
	if body.UnionType == "" && body.Status == "" {
		writeError(w, http.StatusBadRequest, "nothing to update")
		return
	}
	db, _, ok := treeDB(w, r, d)
	if !ok {
		return
	}
	var id string
	if err := db.QueryRowContext(r.Context(),
		`SELECT id FROM unions WHERE
		(partner_a_id = ? AND partner_b_id = ?) OR (partner_a_id = ? AND partner_b_id = ?)`,
		body.PartnerAID, body.PartnerBID, body.PartnerBID, body.PartnerAID).Scan(&id); err != nil {
		if err == sql.ErrNoRows {
			writeError(w, http.StatusNotFound, "union not found")
			return
		}
		writeInternalError(w, r, err)
		return
	}
	set := []string{}
	args := []any{}
	if body.UnionType != "" {
		set = append(set, `union_type = ?`)
		args = append(args, body.UnionType)
	}
	if body.Status != "" {
		set = append(set, `status = ?`)
		args = append(args, body.Status)
	}
	args = append(args, id)
	if _, err := db.ExecContext(r.Context(),
		`UPDATE unions SET `+strings.Join(set, ", ")+` WHERE id = ?`, args...); err != nil {
		writeInternalError(w, r, err)
		return
	}
	var row map[string]any
	cols := []string{"id", "partner_a_id", "partner_b_id", "union_type", "status"}
	vals := make([]any, len(cols))
	ptrs := make([]any, len(cols))
	for i := range vals {
		ptrs[i] = &vals[i]
	}
	if err := db.QueryRowContext(r.Context(),
		`SELECT `+strings.Join(cols, ", ")+` FROM unions WHERE id = ?`, id).Scan(ptrs...); err != nil {
		writeInternalError(w, r, err)
		return
	}
	row = make(map[string]any, len(cols))
	for i, c := range cols {
		row[c] = vals[i]
	}
	writeJSON(w, http.StatusOK, row)
}

func (d Deps) handleAddUnion(w http.ResponseWriter, r *http.Request) {
	var body unionBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if body.PartnerAID == "" || body.PartnerBID == "" {
		writeError(w, http.StatusBadRequest, "partner_a_id and partner_b_id are required")
		return
	}
	if body.PartnerAID == body.PartnerBID {
		writeError(w, http.StatusUnprocessableEntity, "partners must differ")
		return
	}
	unionType := body.UnionType
	if unionType == "" {
		unionType = "TRADITIONAL"
	}
	if !validUnionTypes[unionType] {
		writeError(w, http.StatusBadRequest, "unknown union_type")
		return
	}
	status := body.Status
	if status == "" {
		status = "ACTIVE"
	}
	if !validUnionStatuses[status] {
		writeError(w, http.StatusBadRequest, "unknown status")
		return
	}
	db, _, ok := treeDB(w, r, d)
	if !ok {
		return
	}
	for _, id := range []string{body.PartnerAID, body.PartnerBID} {
		var count int
		if err := db.QueryRowContext(r.Context(),
			`SELECT COUNT(*) FROM individuals WHERE id = ?`, id).Scan(&count); err != nil || count == 0 {
			writeError(w, http.StatusUnprocessableEntity, "unknown partner "+id)
			return
		}
	}
	var dup int
	if err := db.QueryRowContext(r.Context(),
		`SELECT COUNT(*) FROM unions WHERE
		(partner_a_id = ? AND partner_b_id = ?) OR (partner_a_id = ? AND partner_b_id = ?)`,
		body.PartnerAID, body.PartnerBID, body.PartnerBID, body.PartnerAID).Scan(&dup); err != nil {
		writeInternalError(w, r, err)
		return
	}
	if dup > 0 {
		writeError(w, http.StatusConflict, "union already exists")
		return
	}
	id := uuid.NewString()
	if _, err := db.ExecContext(r.Context(),
		`INSERT INTO unions (id, partner_a_id, partner_b_id, union_type, status)
		VALUES (?, ?, ?, ?, ?)`,
		id, body.PartnerAID, body.PartnerBID, unionType, status); err != nil {
		if strings.Contains(err.Error(), "FOREIGN KEY") {
			writeError(w, http.StatusUnprocessableEntity, "unknown partner")
			return
		}
		writeInternalError(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"id": id, "partner_a_id": body.PartnerAID, "partner_b_id": body.PartnerBID,
		"union_type": unionType, "status": status,
	})
}
