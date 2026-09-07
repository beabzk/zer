package api

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/beabzk/zer/internal/calendar"
)

type eventBody struct {
	EventType   string `json:"event_type"`
	EventDateGC string `json:"event_date_gc"`
	EventYearEC *int   `json:"event_year_ec"`
	EventPlace  string `json:"event_place"`
	Description string `json:"description"`
	ClearDate   bool   `json:"clear_date"`
}

// eventColumns validates date fields through the calendar package. Gregorian
// literals must form a real date, Ethiopian years must be positive, and the
// clear flag nulls the date group instead of combining with date values.
func eventColumns(body eventBody, create bool) ([]string, []any, error) {
	var cols []string
	var vals []any
	set := func(col string, v any) {
		cols = append(cols, col)
		vals = append(vals, v)
	}
	if create {
		if strings.TrimSpace(body.EventType) == "" {
			return nil, nil, fmt.Errorf("event_type is required")
		}
	}
	if len(body.EventType) > 80 {
		return nil, nil, fmt.Errorf("event_type must be at most 80 characters")
	}
	if body.ClearDate {
		if body.EventDateGC != "" || body.EventYearEC != nil {
			return nil, nil, fmt.Errorf("clear flag cannot combine with date values")
		}
		set("event_date_gc", nil)
		set("event_year_ec", nil)
		return cols, vals, nil
	}
	if body.EventDateGC != "" {
		var y, m, d int
		if _, err := fmt.Sscanf(body.EventDateGC, "%d-%d-%d", &y, &m, &d); err != nil {
			return nil, nil, fmt.Errorf("invalid event GC date, want YYYY-MM-DD")
		}
		if _, err := calendar.FromGC(y, m, d); err != nil {
			return nil, nil, fmt.Errorf("invalid event GC date: %w", err)
		}
		set("event_date_gc", body.EventDateGC)
	} else if create {
		set("event_date_gc", nil)
	}
	if body.EventYearEC != nil {
		if *body.EventYearEC < 1 {
			return nil, nil, fmt.Errorf("invalid event EC year")
		}
		set("event_year_ec", *body.EventYearEC)
	}
	return cols, vals, nil
}

func scanEvent(row *sql.Row) (overviewEvent, error) {
	var ev overviewEvent
	err := row.Scan(&ev.ID, &ev.IndividualID, &ev.EventType,
		&ev.EventDateGC, &ev.EventYearEC, &ev.EventPlace, &ev.Description)
	return ev, err
}

func (d Deps) handleListEvents(w http.ResponseWriter, r *http.Request) {
	db, _, ok := treeDB(w, r, d)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	if !individualExists(r, db, id) {
		writeError(w, http.StatusNotFound, "individual not found")
		return
	}
	rows, err := db.QueryContext(r.Context(),
		`SELECT id, individual_id, event_type, event_date_gc,
			event_year_ec, event_place, description
		FROM individual_events WHERE individual_id = ? ORDER BY rowid DESC`, id)
	if err != nil {
		writeInternalError(w, r, err)
		return
	}
	defer rows.Close()
	out := []overviewEvent{}
	for rows.Next() {
		var ev overviewEvent
		if err := rows.Scan(&ev.ID, &ev.IndividualID, &ev.EventType,
			&ev.EventDateGC, &ev.EventYearEC, &ev.EventPlace, &ev.Description); err != nil {
			writeInternalError(w, r, err)
			return
		}
		out = append(out, ev)
	}
	if err := rows.Err(); err != nil {
		writeInternalError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (d Deps) handleCreateEvent(w http.ResponseWriter, r *http.Request) {
	var body eventBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	cols, vals, err := eventColumns(body, true)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	db, _, ok := treeDB(w, r, d)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	if !individualExists(r, db, id) {
		writeError(w, http.StatusNotFound, "individual not found")
		return
	}
	eventID := uuid.NewString()
	columns := append([]string{"id", "individual_id", "event_type"}, cols...)
	args := append([]any{eventID, id, strings.TrimSpace(body.EventType)}, vals...)
	placeholders := strings.Repeat("?,", len(args))
	placeholders = strings.TrimSuffix(placeholders, ",")
	query := fmt.Sprintf(`INSERT INTO individual_events (%s) VALUES (%s)`,
		strings.Join(columns, ", "), placeholders)
	if _, err := db.ExecContext(r.Context(), query, args...); err != nil {
		writeInternalError(w, r, err)
		return
	}
	row, err := d.fetchEvent(r, db, eventID)
	if err != nil {
		writeInternalError(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, row)
}

func (d Deps) handleUpdateEvent(w http.ResponseWriter, r *http.Request) {
	var body eventBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	db, _, ok := treeDB(w, r, d)
	if !ok {
		return
	}
	personID := chi.URLParam(r, "id")
	eventID := chi.URLParam(r, "eventID")
	if !d.eventOwned(r, db, eventID, personID) {
		writeError(w, http.StatusNotFound, "event not found")
		return
	}
	cols, vals, err := eventColumns(body, false)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	set := []string{}
	if strings.TrimSpace(body.EventType) != "" {
		if len(body.EventType) > 80 {
			writeError(w, http.StatusBadRequest, "event_type must be at most 80 characters")
			return
		}
		set = append(set, `event_type = ?`)
		vals = append(vals, strings.TrimSpace(body.EventType))
	}
	if body.EventPlace != "" {
		set = append(set, `event_place = ?`)
		vals = append(vals, body.EventPlace)
	}
	if body.Description != "" {
		set = append(set, `description = ?`)
		vals = append(vals, body.Description)
	}
	for _, c := range cols {
		set = append(set, c+` = ?`)
	}
	if len(set) == 0 {
		writeError(w, http.StatusBadRequest, "no updatable fields")
		return
	}
	vals = append(vals, eventID)
	if _, err := db.ExecContext(r.Context(),
		`UPDATE individual_events SET `+strings.Join(set, ", ")+` WHERE id = ?`, vals...); err != nil {
		writeInternalError(w, r, err)
		return
	}
	row, err := d.fetchEvent(r, db, eventID)
	if err != nil {
		writeInternalError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, row)
}

func (d Deps) handleDeleteEvent(w http.ResponseWriter, r *http.Request) {
	db, _, ok := treeDB(w, r, d)
	if !ok {
		return
	}
	res, err := db.ExecContext(r.Context(),
		`DELETE FROM individual_events WHERE id = ? AND individual_id = ?`,
		chi.URLParam(r, "eventID"), chi.URLParam(r, "id"))
	if err != nil {
		writeInternalError(w, r, err)
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		writeError(w, http.StatusNotFound, "event not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (d Deps) fetchEvent(r *http.Request, db *sql.DB, eventID string) (overviewEvent, error) {
	return scanEvent(db.QueryRowContext(r.Context(),
		`SELECT id, individual_id, event_type, event_date_gc,
			event_year_ec, event_place, description
		FROM individual_events WHERE id = ?`, eventID))
}

func (d Deps) eventOwned(r *http.Request, db *sql.DB, eventID, personID string) bool {
	var count int
	if err := db.QueryRowContext(r.Context(),
		`SELECT COUNT(*) FROM individual_events WHERE id = ? AND individual_id = ?`,
		eventID, personID).Scan(&count); err != nil {
		return false
	}
	return count > 0
}
