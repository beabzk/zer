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
	IsDeceased           bool     `json:"is_deceased"`
	DeathYearEC          *int     `json:"death_year_ec"`
	DeathMonthEC         *int     `json:"death_month_ec"`
	DeathDayEC           *int     `json:"death_day_ec"`
	DeathDateGC          string   `json:"death_date_gc"`
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
	birthGC, err := resolveDates(body.BirthYearEC, body.BirthMonthEC, body.BirthDayEC, body.BirthDateGC, "birth")
	if err != nil {
		return nil, nil, err
	}
	if body.BirthYearEC != nil {
		set("birth_year_ec", *body.BirthYearEC)
	}
	if body.BirthMonthEC != nil {
		set("birth_month_ec", *body.BirthMonthEC)
	}
	if body.BirthDayEC != nil {
		set("birth_day_ec", *body.BirthDayEC)
	}
	if birthGC != "" {
		set("birth_date_gc", birthGC)
	}
	if body.BirthPlace != "" {
		set("birth_place", body.BirthPlace)
	}
	if body.BirthNote != "" {
		set("birth_note", body.BirthNote)
	}
	if create || body.IsDeceased {
		set("is_deceased", boolToInt(body.IsDeceased))
	}
	deathGC, err := resolveDates(body.DeathYearEC, body.DeathMonthEC, body.DeathDayEC, body.DeathDateGC, "death")
	if err != nil {
		return nil, nil, err
	}
	if body.DeathYearEC != nil {
		set("death_year_ec", *body.DeathYearEC)
	}
	if body.DeathMonthEC != nil {
		set("death_month_ec", *body.DeathMonthEC)
	}
	if body.DeathDayEC != nil {
		set("death_day_ec", *body.DeathDayEC)
	}
	if deathGC != "" {
		set("death_date_gc", deathGC)
	}
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

// resolveDates validates EC coordinates when fully given and derives the GC
// reference, otherwise validates a literal GC date string.
func resolveDates(y, m, d *int, gc, prefix string) (string, error) {
	anyEC := y != nil || m != nil || d != nil
	if anyEC {
		if y == nil || m == nil || d == nil {
			return "", fmt.Errorf("%s EC date needs year, month, and day together", prefix)
		}
		converted, err := calendar.FromEC(*y, *m, *d)
		if err != nil {
			return "", fmt.Errorf("invalid %s EC date: %w", prefix, err)
		}
		return converted.FormatGC(), nil
	}
	if gc == "" {
		return "", nil
	}
	var gy, gm, gd int
	if _, err := fmt.Sscanf(gc, "%d-%d-%d", &gy, &gm, &gd); err != nil {
		return "", fmt.Errorf("invalid %s GC date, want YYYY-MM-DD", prefix)
	}
	if _, err := calendar.FromGC(gy, gm, gd); err != nil {
		return "", fmt.Errorf("invalid %s GC date: %w", prefix, err)
	}
	return gc, nil
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
