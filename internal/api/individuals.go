package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/beabzk/zer/internal/calendar"
	"github.com/beabzk/zer/internal/lineage"
)

var validGenders = map[string]bool{"MALE": true, "FEMALE": true}

// errIndividualNotFound maps to a 404 at the response boundary.
var errIndividualNotFound = errors.New("individual not found")

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
		writeInternalError(w, r, err)
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

// handleListIndividuals serves the people directory. Query, page size,
// offset, and ordering are explicit at the response boundary while the
// returned entries keep the lightweight selector shape used by pickers.
func (d Deps) handleListIndividuals(w http.ResponseWriter, r *http.Request) {
	db, _, ok := treeDB(w, r, d)
	if !ok {
		return
	}
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	limit, ok := directoryLimit(w, r)
	if !ok {
		return
	}
	offset, ok := directoryOffset(w, r)
	if !ok {
		return
	}
	order, ok := directoryOrder(w, r)
	if !ok {
		return
	}
	filter, filterArgs, ok := directoryFilter(w, r, q)
	if !ok {
		return
	}
	args := filterArgs
	var total int
	if err := db.QueryRowContext(r.Context(),
		`SELECT COUNT(*) FROM individuals `+filter, args...).Scan(&total); err != nil {
		writeInternalError(w, r, err)
		return
	}
	rows, err := db.QueryContext(r.Context(),
		`SELECT id FROM individuals `+filter+` `+order+` LIMIT ? OFFSET ?`,
		append(args, limit, offset)...)
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
	if err := rows.Err(); err != nil {
		writeInternalError(w, r, err)
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
	writeJSON(w, http.StatusOK, map[string]any{
		"individuals": out, "total": total, "limit": limit, "offset": offset,
	})
}

// directoryLimit reads an explicit page size. The list handler previously
// read the depth value as its limit, so depth still applies when limit is absent.
func directoryLimit(w http.ResponseWriter, r *http.Request) (int, bool) {
	if raw := r.URL.Query().Get("limit"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 1 || n > 200 {
			writeError(w, http.StatusBadRequest, "limit must be between 1 and 200")
			return 0, false
		}
		return n, true
	}
	limit := queryDepth(r, 50)
	if limit > 200 {
		limit = 200
	}
	return limit, true
}

func directoryOffset(w http.ResponseWriter, r *http.Request) (int, bool) {
	raw := r.URL.Query().Get("offset")
	if raw == "" {
		return 0, true
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n < 0 {
		writeError(w, http.StatusBadRequest, "offset must be a non-negative integer")
		return 0, false
	}
	return n, true
}

func directoryOrder(w http.ResponseWriter, r *http.Request) (string, bool) {
	switch r.URL.Query().Get("order") {
	case "", "created":
		return `ORDER BY created_at, rowid`, true
	case "recent":
		return `ORDER BY updated_at DESC, rowid DESC`, true
	case "name":
		return `ORDER BY given_name_latin COLLATE NOCASE, given_name_native, rowid`, true
	default:
		writeError(w, http.StatusBadRequest, "order must be created, recent, or name")
		return "", false
	}
}

// directoryFilter builds the shared WHERE clause for the total count and
// the page query so both describe the same filtered set.
func directoryFilter(w http.ResponseWriter, r *http.Request, q string) (string, []any, bool) {
	conds := []string{}
	args := []any{}
	if q != "" {
		like := "%" + q + "%"
		conds = append(conds, `(given_name_native LIKE ? OR given_name_latin LIKE ?)`)
		args = append(args, like, like)
	}
	if gender := r.URL.Query().Get("gender"); gender != "" {
		if !validGenders[gender] {
			writeError(w, http.StatusBadRequest, "gender must be MALE or FEMALE")
			return "", nil, false
		}
		conds = append(conds, `gender = ?`)
		args = append(args, gender)
	}
	if raw := r.URL.Query().Get("deceased"); raw != "" {
		switch raw {
		case "true":
			conds = append(conds, `is_deceased = 1`)
		case "false":
			conds = append(conds, `is_deceased = 0`)
		default:
			writeError(w, http.StatusBadRequest, "deceased must be true or false")
			return "", nil, false
		}
	}
	if len(conds) == 0 {
		return "", args, true
	}
	return `WHERE ` + strings.Join(conds, " AND "), args, true
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
	// Micros keep updated_at lexicographically chronological with the
	// creation default so recent-first ordering stays correct.
	vals = append(vals, time.Now().UTC().Format("2006-01-02 15:04:05.000000"))
	vals = append(vals, id)
	var exists int
	if err := db.QueryRowContext(r.Context(),
		`SELECT COUNT(*) FROM individuals WHERE id = ?`, id).Scan(&exists); err != nil || exists == 0 {
		writeError(w, http.StatusNotFound, "individual not found")
		return
	}
	if _, err := db.ExecContext(r.Context(),
		`UPDATE individuals SET `+strings.Join(set, ", ")+` WHERE id = ?`, vals...); err != nil {
		writeInternalError(w, r, err)
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
		writeInternalError(w, r, err)
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
	row, err := d.fetchIndividualRow(r, db, id, queryDepth(r, 3), r.URL.Query().Get("titles") != "0")
	if err != nil {
		if err == errIndividualNotFound {
			writeError(w, http.StatusNotFound, "individual not found")
			return
		}
		writeInternalError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, row)
}

// fetchIndividualRow reads one person with server-synthesized full names.
// Callers map errIndividualNotFound to a 404 response.
func (d Deps) fetchIndividualRow(r *http.Request, db *sql.DB, id string, depth int, withTitles bool) (map[string]any, error) {
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
			return nil, errIndividualNotFound
		}
		return nil, err
	}
	row := make(map[string]any, len(cols)+2)
	for i, c := range cols {
		row[c] = vals[i]
	}
	native, err := lineage.SynthesizeFullName(r.Context(), db, id, depth, lineage.ScriptNative, false)
	if err != nil {
		return nil, err
	}
	latin, err := lineage.SynthesizeFullName(r.Context(), db, id, depth, lineage.ScriptLatin, false)
	if err != nil {
		return nil, err
	}
	row["full_native"] = native
	row["full_latin"] = latin
	if withTitles {
		titled, err := lineage.SynthesizeFullName(r.Context(), db, id, depth, lineage.ScriptLatin, true)
		if err != nil {
			return nil, err
		}
		row["display_name"] = titled
	}
	return row, nil
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
