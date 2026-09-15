package api

import (
	"database/sql"
	"net/http"

	"github.com/beabzk/zer/internal/lineage"
)

// Overview page sizes. Recent activity derives from existing updated_at,
// created_at, and event rows; there is no audit-log table.
const (
	overviewRecentPeople = 8
	overviewRecentEvents = 8
)

type overviewCounts struct {
	Individuals int `json:"individuals"`
	Edges       int `json:"edges"`
	Unions      int `json:"unions"`
	Events      int `json:"events"`
	Members     int `json:"members"`
}

type overviewPerson struct {
	ID         string `json:"id"`
	FullNative string `json:"full_native"`
	FullLatin  string `json:"full_latin"`
	Gender     string `json:"gender"`
	BirthYear  *int   `json:"birth_year_ec,omitempty"`
	DeathYear  *int   `json:"death_year_ec,omitempty"`
	IsDeceased bool   `json:"is_deceased"`
	UpdatedAt  string `json:"updated_at"`
}

type overviewEvent struct {
	ID           string  `json:"id"`
	IndividualID string  `json:"individual_id"`
	EventType    string  `json:"event_type"`
	EventDateGC  *string `json:"event_date_gc,omitempty"`
	EventYearEC  *int    `json:"event_year_ec,omitempty"`
	EventPlace   *string `json:"event_place,omitempty"`
	Description  *string `json:"description,omitempty"`
	FullNative   string  `json:"full_native"`
	FullLatin    string  `json:"full_latin"`
}

type overviewResponse struct {
	Tree              treeResponse     `json:"tree"`
	Counts            overviewCounts   `json:"counts"`
	RecentIndividuals []overviewPerson `json:"recent_individuals"`
	RecentEvents      []overviewEvent  `json:"recent_events"`
}

func (d Deps) handleTreeOverview(w http.ResponseWriter, r *http.Request) {
	db, m, ok := treeDB(w, r, d)
	if !ok {
		return
	}
	master, err := d.Manager.Master(r.Context())
	if err != nil {
		writeInternalError(w, r, err)
		return
	}
	var meta treeResponse
	var desc *string
	if err := master.QueryRowContext(r.Context(),
		`SELECT id, name, slug, description, default_lang FROM trees WHERE id = ?`,
		m.TreeID).Scan(&meta.ID, &meta.Name, &meta.Slug, &desc, &meta.DefaultLang); err != nil {
		writeInternalError(w, r, err)
		return
	}
	if desc != nil {
		meta.Description = *desc
	}
	meta.Role = m.Role

	count := func(query string, args ...any) int {
		var n int
		_ = db.QueryRowContext(r.Context(), query, args...).Scan(&n)
		return n
	}
	var members int
	_ = master.QueryRowContext(r.Context(),
		`SELECT COUNT(*) FROM tree_members WHERE tree_id = ?`, m.TreeID).Scan(&members)
	counts := overviewCounts{
		Individuals: count(`SELECT COUNT(*) FROM individuals`),
		Edges:       count(`SELECT COUNT(*) FROM parent_child`),
		Unions:      count(`SELECT COUNT(*) FROM unions`),
		Events:      count(`SELECT COUNT(*) FROM individual_events`),
		Members:     members,
	}

	recent, err := d.overviewRecentPeople(r, db)
	if err != nil {
		writeInternalError(w, r, err)
		return
	}
	events, err := d.overviewRecentEvents(r, db)
	if err != nil {
		writeInternalError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, overviewResponse{
		Tree: meta, Counts: counts, RecentIndividuals: recent, RecentEvents: events,
	})
}

func (d Deps) overviewRecentPeople(r *http.Request, db *sql.DB) ([]overviewPerson, error) {
	rows, err := db.QueryContext(r.Context(),
		`SELECT id, gender, birth_year_ec, death_year_ec, is_deceased, updated_at FROM individuals
		ORDER BY updated_at DESC, rowid DESC LIMIT ?`, overviewRecentPeople)
	if err != nil {
		return nil, err
	}
	var ids []overviewPerson
	for rows.Next() {
		var p overviewPerson
		var deceased int
		if err := rows.Scan(&p.ID, &p.Gender, &p.BirthYear, &p.DeathYear,
			&deceased, &p.UpdatedAt); err != nil {
			rows.Close()
			return nil, err
		}
		p.IsDeceased = deceased == 1
		ids = append(ids, p)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	// Names resolve after the rows close because the pool holds a single
	// connection and nested queries would deadlock.
	out := []overviewPerson{}
	for _, p := range ids {
		native, _ := lineage.SynthesizeFullName(r.Context(), db, p.ID, 3, lineage.ScriptNative, false)
		latin, _ := lineage.SynthesizeFullName(r.Context(), db, p.ID, 3, lineage.ScriptLatin, false)
		p.FullNative, p.FullLatin = native, latin
		out = append(out, p)
	}
	return out, nil
}

func (d Deps) overviewRecentEvents(r *http.Request, db *sql.DB) ([]overviewEvent, error) {
	rows, err := db.QueryContext(r.Context(),
		`SELECT id, individual_id, event_type, event_date_gc,
			event_year_ec, event_place, description
		FROM individual_events ORDER BY rowid DESC LIMIT ?`, overviewRecentEvents)
	if err != nil {
		return nil, err
	}
	var staged []overviewEvent
	for rows.Next() {
		var ev overviewEvent
		if err := rows.Scan(&ev.ID, &ev.IndividualID, &ev.EventType,
			&ev.EventDateGC, &ev.EventYearEC, &ev.EventPlace, &ev.Description); err != nil {
			rows.Close()
			return nil, err
		}
		staged = append(staged, ev)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	// Names resolve after the rows close because the pool holds a single
	// connection and nested queries would deadlock.
	out := []overviewEvent{}
	for _, ev := range staged {
		native, _ := lineage.SynthesizeFullName(r.Context(), db, ev.IndividualID, 3, lineage.ScriptNative, false)
		latin, _ := lineage.SynthesizeFullName(r.Context(), db, ev.IndividualID, 3, lineage.ScriptLatin, false)
		ev.FullNative, ev.FullLatin = native, latin
		out = append(out, ev)
	}
	return out, nil
}
