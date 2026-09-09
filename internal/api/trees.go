package api

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/google/uuid"

	"github.com/beabzk/zer/internal/auth"
)

type createTreeBody struct {
	Name        string `json:"name"`
	Slug        string `json:"slug"`
	Description string `json:"description"`
	DefaultLang string `json:"default_lang"`
}

type treeResponse struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Slug        string `json:"slug"`
	Description string `json:"description,omitempty"`
	DefaultLang string `json:"default_lang"`
	Role        string `json:"role,omitempty"`
}

func (d Deps) handleCreateTree(w http.ResponseWriter, r *http.Request) {
	session, ok := auth.SessionFrom(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	userID, err := sessionUserID(session)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var body createTreeBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	body.Name = strings.TrimSpace(body.Name)
	if body.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	slug := body.Slug
	if slug == "" {
		slug = slugify(body.Name)
	} else {
		slug = slugify(slug)
	}
	if slug == "" {
		writeError(w, http.StatusBadRequest, "slug is required")
		return
	}
	lang := body.DefaultLang
	if lang == "" {
		lang = "en"
	}

	id := uuid.NewString()
	master, err := d.Manager.Master(r.Context())
	if err != nil {
		writeInternalError(w, r, err)
		return
	}
	// Registry and membership commit atomically. The tree file lives on a
	// separate handle outside the transaction, so file creation sits between
	// the two writes and any failure rolls everything back.
	tx, err := master.Begin()
	if err != nil {
		writeInternalError(w, r, err)
		return
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
			_ = d.Manager.DropTree(id)
		}
	}()
	if _, err := tx.ExecContext(r.Context(),
		`INSERT INTO trees (id, name, slug, description, default_lang, created_by)
		VALUES (?, ?, ?, ?, ?, ?)`,
		id, body.Name, slug, nullIfEmpty(body.Description), lang, userID); err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			writeError(w, http.StatusConflict, "slug already exists")
			return
		}
		writeInternalError(w, r, err)
		return
	}
	if _, err := d.Manager.Tree(r.Context(), id); err != nil {
		writeInternalError(w, r, err)
		return
	}
	if _, err := tx.ExecContext(r.Context(),
		`INSERT INTO tree_members (id, tree_id, user_id, role) VALUES (?, ?, ?, 'OWNER')`,
		uuid.NewString(), id, userID); err != nil {
		writeInternalError(w, r, err)
		return
	}
	if err := tx.Commit(); err != nil {
		writeInternalError(w, r, err)
		return
	}
	committed = true
	writeJSON(w, http.StatusCreated, treeResponse{
		ID: id, Name: body.Name, Slug: slug,
		Description: body.Description, DefaultLang: lang, Role: RoleOwner,
	})
}

func (d Deps) handleListTrees(w http.ResponseWriter, r *http.Request) {
	session, ok := auth.SessionFrom(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	userID, err := sessionUserID(session)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	master, err := d.Manager.Master(r.Context())
	if err != nil {
		writeInternalError(w, r, err)
		return
	}
	rows, err := master.QueryContext(r.Context(),
		`SELECT t.id, t.name, t.slug, t.description, t.default_lang, m.role
		FROM trees t JOIN tree_members m ON m.tree_id = t.id
		WHERE m.user_id = ? ORDER BY t.name`, userID)
	if err != nil {
		writeInternalError(w, r, err)
		return
	}
	defer rows.Close()
	trees := []treeResponse{}
	for rows.Next() {
		var tr treeResponse
		var desc *string
		if err := rows.Scan(&tr.ID, &tr.Name, &tr.Slug, &desc, &tr.DefaultLang, &tr.Role); err != nil {
			writeInternalError(w, r, err)
			return
		}
		if desc != nil {
			tr.Description = *desc
		}
		trees = append(trees, tr)
	}
	if err := rows.Err(); err != nil {
		writeInternalError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, trees)
}

func (d Deps) handleTreeStats(w http.ResponseWriter, r *http.Request) {
	db, m, ok := treeDB(w, r, d)
	if !ok {
		return
	}
	count := func(query string) int {
		var n int
		_ = db.QueryRowContext(r.Context(), query).Scan(&n)
		return n
	}
	master, err := d.Manager.Master(r.Context())
	if err != nil {
		writeInternalError(w, r, err)
		return
	}
	var members int
	_ = master.QueryRowContext(r.Context(),
		`SELECT COUNT(*) FROM tree_members WHERE tree_id = ?`, m.TreeID).Scan(&members)
	writeJSON(w, http.StatusOK, map[string]any{
		"tree_id":     m.TreeID,
		"individuals": count(`SELECT COUNT(*) FROM individuals`),
		"edges":       count(`SELECT COUNT(*) FROM parent_child`),
		"unions":      count(`SELECT COUNT(*) FROM unions`),
		"events":      count(`SELECT COUNT(*) FROM individual_events`),
		"members":     members,
	})
}

type addMemberBody struct {
	UserID int64  `json:"user_id"`
	Role   string `json:"role"`
}

func (d Deps) handleAddMember(w http.ResponseWriter, r *http.Request) {
	m := memberFrom(r)
	var body addMemberBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if body.UserID <= 0 {
		writeError(w, http.StatusBadRequest, "user_id is required")
		return
	}
	rank, valid := roleRank[body.Role]
	if !valid {
		writeError(w, http.StatusBadRequest, "unknown role")
		return
	}
	if m.Role != RoleOwner && rank >= roleRank[m.Role] {
		writeError(w, http.StatusForbidden, "cannot grant a role at or above your own")
		return
	}
	master, err := d.Manager.Master(r.Context())
	if err != nil {
		writeInternalError(w, r, err)
		return
	}
	var userCount int
	if err := master.QueryRowContext(r.Context(),
		`SELECT COUNT(*) FROM users WHERE id = ?`, body.UserID).Scan(&userCount); err != nil || userCount == 0 {
		writeError(w, http.StatusBadRequest, "unknown user")
		return
	}
	if _, err := master.ExecContext(r.Context(),
		`INSERT INTO tree_members (id, tree_id, user_id, role) VALUES (?, ?, ?, ?)`,
		uuid.NewString(), m.TreeID, body.UserID, body.Role); err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			writeError(w, http.StatusConflict, "user is already a member")
			return
		}
		writeInternalError(w, r, err)
		return
	}
	member, ok := d.memberWithUser(w, r, m, body.UserID)
	if !ok {
		return
	}
	writeJSON(w, http.StatusCreated, member)
}

// slugify keeps lowercase letters, digits, and hyphens.
func slugify(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	var b strings.Builder
	prevDash := true
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z' || r >= '0' && r <= '9':
			b.WriteRune(r)
			prevDash = false
		case r == ' ' || r == '_' || r == '-':
			if !prevDash {
				b.WriteRune('-')
				prevDash = true
			}
		}
	}
	return strings.Trim(b.String(), "-")
}

func nullIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}
