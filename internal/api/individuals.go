package api

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/beabzk/zer/internal/calendar"
	"github.com/beabzk/zer/internal/lineage"
)

var validGenders = map[string]bool{"MALE": true, "FEMALE": true}

type individualBody struct {
	GivenNameNative      string   `json:"given_name_native"`
	GivenNameLatin       string   `json:"given_name_latin"`
	Gender               string   `json:"gender"`
	Titles               []string `json:"titles"`
	TitlesDisplayEnabled *bool    `json:"titles_display_enabled"`
	BirthYearEC          *int     `json:"birth_year_ec"`
	BirthMonthEC         *int     `json:"birth_month_ec"`
	BirthDayEC           *int     `json:"birth_day_ec"`
	BirthDateGC          string   `json:"birth_date_gc"`
	BirthPlace           string   `json:"birth_place"`
	BirthNote            string   `json:"birth_note"`
	ClearBirthDate       bool     `json:"clear_birth_date"`
	IsDeceased           bool     `json:"is_deceased"`
	DeathYearEC          *int     `json:"death_year_ec"`
	DeathMonthEC         *int     `json:"death_month_ec"`
	DeathDayEC           *int     `json:"death_day_ec"`
	DeathDateGC          string   `json:"death_date_gc"`
	ClearDeathDate       bool     `json:"clear_death_date"`
	DeathPlace           string   `json:"death_place"`
	DeathNote            string   `json:"death_note"`
	ProfilePhotoURL      string   `json:"profile_photo_url"`
}

func (d Deps) handleCreateIndividual(w http.ResponseWriter, r *http.Request) {
	var body individualBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	cols, vals, err := individualColumns(body, true)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	db, _, ok := treeDB(w, r, d)
	if !ok {
		return
	}
	id := uuid.NewString()
	placeholders := strings.Repeat("?,", len(vals))
	placeholders = strings.TrimSuffix(placeholders, ",")
	query := fmt.Sprintf(`INSERT INTO individuals (id, %s) VALUES (?, %s)`,
		strings.Join(cols, ", "), placeholders)
	args := append([]any{id}, vals...)
	if _, err := db.ExecContext(r.Context(), query, args...); err != nil {
		writeError(w, http.StatusInternalServerError, "storage unavailable")
		return
	}
	d.respondIndividual(w, r, db, id)
}

func (d Deps) handleGetIndividual(w http.ResponseWriter, r *http.Request) {
	db, _, ok := treeDB(w, r, d)
	if !ok {
		return
	}
	d.respondIndividual(w, r, db, chi.URLParam(r, "id"))
}

// handleListIndividuals searches people by name fragment for pickers and
// lists. Results carry synthesized names at depth 3.
func (d Deps) handleListIndividuals(w http.ResponseWriter, r *http.Request) {
	db, _, ok := treeDB(w, r, d)
	if !ok {
		return
	}
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	limit := queryDepth(r, 50)
	if limit > 200 {
		limit = 200
	}
	query := `SELECT id FROM individuals ORDER BY created_at LIMIT ?`
	args := []any{limit}
	if q != "" {
		like := "%" + q + "%"
		query = `SELECT id FROM individuals
			WHERE given_name_native LIKE ? OR given_name_latin LIKE ?
			ORDER BY created_at LIMIT ?`
		args = []any{like, like, limit}
	}
	rows, err := db.QueryContext(r.Context(), query, args...)
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
	if err := rows.Err(); err != nil {
		writeError(w, http.StatusInternalServerError, "storage unavailable")
		return
	}
	// IDs resolve after the rows close because the pool holds a single
	// connection and nested queries would deadlock.
	out := []map[string]any{}
	for _, id := range ids {
		native, _ := lineage.SynthesizeFullName(r.Context(), db, id, 3, lineage.ScriptNative, false)
		latin, _ := lineage.SynthesizeFullName(r.Context(), db, id, 3, lineage.ScriptLatin, false)
		var gender string
		_ = db.QueryRowContext(r.Context(),
			`SELECT gender FROM individuals WHERE id = ?`, id).Scan(&gender)
		out = append(out, map[string]any{
			"id": id, "full_native": native, "full_latin": latin, "gender": gender,
		})
	}
	writeJSON(w, http.StatusOK, out)
}

func (d Deps) handleUpdateIndividual(w http.ResponseWriter, r *http.Request) {
	var body individualBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	cols, vals, err := individualColumns(body, false)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if len(cols) == 0 {
		writeError(w, http.StatusBadRequest, "no updatable fields")
		return
	}
	db, _, ok := treeDB(w, r, d)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	set := make([]string, 0, len(cols)+1)
	for _, c := range cols {
		set = append(set, c+` = ?`)
	}
	set = append(set, `updated_at = ?`)
	vals = append(vals, time.Now().UTC().Format("2006-01-02 15:04:05"))
	vals = append(vals, id)
	var exists int
	if err := db.QueryRowContext(r.Context(),
		`SELECT COUNT(*) FROM individuals WHERE id = ?`, id).Scan(&exists); err != nil || exists == 0 {
		writeError(w, http.StatusNotFound, "individual not found")
		return
	}
	if _, err := db.ExecContext(r.Context(),
		`UPDATE individuals SET `+strings.Join(set, ", ")+` WHERE id = ?`, vals...); err != nil {
		writeError(w, http.StatusInternalServerError, "storage unavailable")
		return
	}
	d.respondIndividual(w, r, db, id)
}

func (d Deps) handleDeleteIndividual(w http.ResponseWriter, r *http.Request) {
	db, _, ok := treeDB(w, r, d)
	if !ok {
		return
	}
	res, err := db.ExecContext(r.Context(),
		`DELETE FROM individuals WHERE id = ?`, chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "storage unavailable")
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		writeError(w, http.StatusNotFound, "individual not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (d Deps) respondIndividual(w http.ResponseWriter, r *http.Request, db *sql.DB, id string) {
	depth := queryDepth(r, 3)
	withTitles := r.URL.Query().Get("titles") != "0"

	var row map[string]any
	cols := []string{"id", "given_name_native", "given_name_latin", "gender", "titles",
		"titles_display_enabled", "birth_year_ec", "birth_month_ec", "birth_day_ec",
		"birth_date_gc", "birth_place", "birth_note", "is_deceased",
		"death_year_ec", "death_month_ec", "death_day_ec", "death_date_gc",
		"death_place", "death_note", "profile_photo_url", "created_at", "updated_at"}
	qrow := db.QueryRowContext(r.Context(),
		`SELECT `+strings.Join(cols, ", ")+` FROM individuals WHERE id = ?`, id)
	vals := make([]any, len(cols))
	ptrs := make([]any, len(cols))
	for i := range vals {
		ptrs[i] = &vals[i]
	}
	if err := qrow.Scan(ptrs...); err != nil {
		if err == sql.ErrNoRows {
			writeError(w, http.StatusNotFound, "individual not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "storage unavailable")
		return
	}
	row = make(map[string]any, len(cols)+2)
	for i, c := range cols {
		row[c] = vals[i]
	}
	native, err := lineage.SynthesizeFullName(r.Context(), db, id, depth, lineage.ScriptNative, false)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "storage unavailable")
		return
	}
	latin, err := lineage.SynthesizeFullName(r.Context(), db, id, depth, lineage.ScriptLatin, false)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "storage unavailable")
		return
	}
	row["full_native"] = native
	row["full_latin"] = latin
	if withTitles {
		titled, err := lineage.SynthesizeFullName(r.Context(), db, id, depth, lineage.ScriptLatin, true)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "storage unavailable")
			return
		}
		row["display_name"] = titled
	}
	writeJSON(w, http.StatusOK, row)
}

// individualColumns validates a body and maps it to column names and values.
// Required-field checks apply on create only.
func individualColumns(body individualBody, create bool) ([]string, []any, error) {
	if create {
		if strings.TrimSpace(body.GivenNameNative) == "" || strings.TrimSpace(body.GivenNameLatin) == "" {
			return nil, nil, fmt.Errorf("given_name_native and given_name_latin are required")
		}
		if !validGenders[body.Gender] {
			return nil, nil, fmt.Errorf("gender must be MALE or FEMALE")
		}
	}
	var cols []string
	var vals []any
	set := func(col string, v any) {
		cols = append(cols, col)
		vals = append(vals, v)
	}
	if body.GivenNameNative != "" {
		set("given_name_native", body.GivenNameNative)
	}
	if body.GivenNameLatin != "" {
		set("given_name_latin", body.GivenNameLatin)
	}
	if body.Gender != "" {
		if !validGenders[body.Gender] {
			return nil, nil, fmt.Errorf("gender must be MALE or FEMALE")
		}
		set("gender", body.Gender)
	}
	if body.Titles != nil {
		raw, err := json.Marshal(body.Titles)
		if err != nil {
			return nil, nil, fmt.Errorf("invalid titles")
		}
		set("titles", string(raw))
	}
	if body.TitlesDisplayEnabled != nil {
		set("titles_display_enabled", boolToInt(*body.TitlesDisplayEnabled))
	}
	birthCols, birthVals, err := dateColumns("birth",
		body.BirthYearEC, body.BirthMonthEC, body.BirthDayEC, body.BirthDateGC, body.ClearBirthDate)
	if err != nil {
		return nil, nil, err
	}
	cols = append(cols, birthCols...)
	vals = append(vals, birthVals...)
	if body.BirthPlace != "" {
		set("birth_place", body.BirthPlace)
	}
	if body.BirthNote != "" {
		set("birth_note", body.BirthNote)
	}
	if create || body.IsDeceased {
		set("is_deceased", boolToInt(body.IsDeceased))
	}
	deathCols, deathVals, err := dateColumns("death",
		body.DeathYearEC, body.DeathMonthEC, body.DeathDayEC, body.DeathDateGC, body.ClearDeathDate)
	if err != nil {
		return nil, nil, err
	}
	cols = append(cols, deathCols...)
	vals = append(vals, deathVals...)
	if body.DeathPlace != "" {
		set("death_place", body.DeathPlace)
	}
	if body.DeathNote != "" {
		set("death_note", body.DeathNote)
	}
	if body.ProfilePhotoURL != "" {
		set("profile_photo_url", body.ProfilePhotoURL)
	}
	return cols, vals, nil
}

// dateColumns maps one EC/GC date group to column assignments. Any EC
// subset stores as-is with a stale GC reference cleared, a complete trio
// derives GC, and a GC literal stores alone with the EC trio cleared so the
// two never contradict. The clear flag nulls the whole group and rejects
// accompanying values. A present EC group replaces the stored trio as a
// unit: absent members null out.
func dateColumns(prefix string, y, m, d *int, gc string, clear bool) ([]string, []any, error) {
	yCol, mCol, dCol, gCol := prefix+"_year_ec", prefix+"_month_ec", prefix+"_day_ec", prefix+"_date_gc"
	var cols []string
	var vals []any
	set := func(col string, v any) {
		cols = append(cols, col)
		vals = append(vals, v)
	}
	nullGroup := func() {
		set(yCol, nil)
		set(mCol, nil)
		set(dCol, nil)
		set(gCol, nil)
	}
	if clear {
		if y != nil || m != nil || d != nil || gc != "" {
			return nil, nil, fmt.Errorf("%s clear flag cannot combine with date values", prefix)
		}
		nullGroup()
		return cols, vals, nil
	}
	if y == nil && m == nil && d == nil {
		if gc == "" {
			return nil, nil, nil
		}
		var gy, gm, gd int
		if _, err := fmt.Sscanf(gc, "%d-%d-%d", &gy, &gm, &gd); err != nil {
			return nil, nil, fmt.Errorf("invalid %s GC date, want YYYY-MM-DD", prefix)
		}
		if _, err := calendar.FromGC(gy, gm, gd); err != nil {
			return nil, nil, fmt.Errorf("invalid %s GC date: %w", prefix, err)
		}
		set(yCol, nil)
		set(mCol, nil)
		set(dCol, nil)
		set(gCol, gc)
		return cols, vals, nil
	}
	if err := calendar.ValidatePartialEC(y, m, d); err != nil {
		return nil, nil, fmt.Errorf("invalid %s EC date: %w", prefix, err)
	}
	if y != nil {
		set(yCol, *y)
	} else {
		set(yCol, nil)
	}
	if m != nil {
		set(mCol, *m)
	} else {
		set(mCol, nil)
	}
	if d != nil {
		set(dCol, *d)
	} else {
		set(dCol, nil)
	}
	if y != nil && m != nil && d != nil {
		converted, err := calendar.FromEC(*y, *m, *d)
		if err != nil {
			return nil, nil, fmt.Errorf("invalid %s EC date: %w", prefix, err)
		}
		set(gCol, converted.FormatGC())
	} else {
		set(gCol, nil)
	}
	return cols, vals, nil
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
