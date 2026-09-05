// Package seed builds a deterministic demo family tree. The fixture is
// committed as code, covers the domain model edge cases, and doubles as
// shared test data. Names are fictional.
package seed

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"github.com/google/uuid"

	"github.com/beabzk/zer/internal/calendar"
	"github.com/beabzk/zer/internal/database"
	"github.com/beabzk/zer/internal/lineage"
)

type person struct {
	key      string
	native   string
	latin    string
	gender   string
	titles   []string
	birth    [3]int // year, month, day, zero means unknown
	death    [3]int
	deceased bool
	place    string
}

type edge struct {
	parent, child string
	rel           string
	nameSource    bool
}

type union struct {
	a, b   string
	kind   string
	status string
}

// Fixture people. Birth trios use mid-month days so every date converts.
var people = []person{
	{key: "tesfaye", native: "ተስፋዬ", latin: "Tesfaye", gender: "MALE",
		titles: []string{"Ato"}, birth: [3]int{1915, 6, 15}, death: [3]int{2002, 2, 10},
		deceased: true, place: "Gondar"},
	{key: "aster", native: "አስቴር", latin: "Aster", gender: "FEMALE",
		birth: [3]int{1920, 9, 20}, place: "Gondar"},
	{key: "kebede", native: "ቀበደ", latin: "Kebede", gender: "MALE",
		birth: [3]int{1950, 3, 15}, place: "Addis Ababa"},
	{key: "tigist", native: "ትግስት", latin: "Tigist", gender: "FEMALE",
		birth: [3]int{1955, 11, 12}, place: "Harar"},
	{key: "bekele", native: "በቀለ", latin: "Bekele", gender: "MALE",
		birth: [3]int{1950, 1, 8}, place: "Harar"},
	{key: "dawit", native: "ዳዊት", latin: "Dawit", gender: "MALE",
		birth: [3]int{1985, 7, 19}, place: "Addis Ababa"},
	{key: "hana", native: "ሃና", latin: "Hana", gender: "FEMALE",
		birth: [3]int{2010, 0, 0}},
	{key: "yonas", native: "ዮናስ", latin: "Yonas", gender: "MALE",
		birth: [3]int{1988, 5, 25}},
	{key: "selam", native: "ሰላም", latin: "Selam", gender: "FEMALE",
		birth: [3]int{1995, 12, 0}},
	{key: "kidist", native: "ቅድስት", latin: "Kidist", gender: "FEMALE",
		birth: [3]int{1990, 4, 3}},
}

var edges = []edge{
	{"tesfaye", "kebede", "BIOLOGICAL", true},
	{"aster", "kebede", "BIOLOGICAL", false},
	{"kebede", "dawit", "BIOLOGICAL", false},
	{"tigist", "dawit", "BIOLOGICAL", true},
	{"kebede", "hana", "BIOLOGICAL", true},
	{"tigist", "hana", "BIOLOGICAL", false},
	{"kebede", "yonas", "ADOPTIVE", true},
	{"tigist", "yonas", "ADOPTIVE", false},
	{"kebede", "selam", "FOSTER", false},
	{"tigist", "selam", "FOSTER", false},
}

var unions = []union{
	{"tesfaye", "aster", "TRADITIONAL", "WIDOWED"},
	{"kebede", "tigist", "TRADITIONAL", "ACTIVE"},
	{"tigist", "bekele", "RELIGIOUS", "DISSOLVED"},
	{"yonas", "kidist", "CIVIL", "ACTIVE"},
}

// DemoTree creates a new tree filled with the fixture and grants the user
// OWNER membership. It fails when the slug is taken.
func DemoTree(ctx context.Context, manager *database.Manager, userID int64, name, slug string) (string, error) {
	slug = strings.TrimSpace(slug)
	if slug == "" || name == "" {
		return "", fmt.Errorf("seed: name and slug are required")
	}
	master, err := manager.Master(ctx)
	if err != nil {
		return "", err
	}
	treeID := uuid.NewString()
	tx, err := master.Begin()
	if err != nil {
		return "", err
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
			_ = manager.DropTree(treeID)
		}
	}()
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO trees (id, name, slug, description, default_lang, created_by)
		VALUES (?, ?, ?, ?, 'en', ?)`,
		treeID, name, slug, "Demo family tree with fictional people", userID); err != nil {
		return "", err
	}
	db, err := manager.Tree(ctx, treeID)
	if err != nil {
		return "", err
	}
	if err := fillTree(ctx, db); err != nil {
		return "", err
	}
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO tree_members (id, tree_id, user_id, role) VALUES (?, ?, ?, 'OWNER')`,
		uuid.NewString(), treeID, userID); err != nil {
		return "", err
	}
	if err := tx.Commit(); err != nil {
		return "", err
	}
	committed = true
	return treeID, nil
}

func fillTree(ctx context.Context, db *sql.DB) error {
	for _, p := range people {
		titles := ""
		if len(p.titles) > 0 {
			titles = `["` + strings.Join(p.titles, `","`) + `"]`
		}
		var birthGC, deathGC sql.NullString
		if p.birth[0] != 0 && p.birth[1] != 0 && p.birth[2] != 0 {
			converted, err := calendar.FromEC(p.birth[0], p.birth[1], p.birth[2])
			if err != nil {
				return fmt.Errorf("seed %s birth: %w", p.key, err)
			}
			birthGC = sql.NullString{String: converted.FormatGC(), Valid: true}
		}
		if p.deceased {
			converted, err := calendar.FromEC(p.death[0], p.death[1], p.death[2])
			if err != nil {
				return fmt.Errorf("seed %s death: %w", p.key, err)
			}
			deathGC = sql.NullString{String: converted.FormatGC(), Valid: true}
		}
		if _, err := db.ExecContext(ctx,
			`INSERT INTO individuals (id, given_name_native, given_name_latin, gender, titles,
				birth_year_ec, birth_month_ec, birth_day_ec, birth_date_gc, birth_place,
				is_deceased, death_year_ec, death_month_ec, death_day_ec, death_date_gc)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			"demo-"+p.key, p.native, p.latin, p.gender, titles,
			nullInt(p.birth[0]), nullInt(p.birth[1]), nullInt(p.birth[2]), birthGC, nullStr(p.place),
			boolToInt(p.deceased),
			nullInt(p.death[0]), nullInt(p.death[1]), nullInt(p.death[2]), deathGC); err != nil {
			return fmt.Errorf("seed %s: %w", p.key, err)
		}
	}
	for _, e := range edges {
		if err := lineage.ValidateParentLink(ctx, db, "demo-"+e.parent, "demo-"+e.child); err != nil {
			return fmt.Errorf("seed edge %s->%s: %w", e.parent, e.child, err)
		}
		if _, err := db.ExecContext(ctx,
			`INSERT INTO parent_child (id, parent_id, child_id, relationship_type, is_name_source)
			VALUES (?, ?, ?, ?, ?)`,
			"demo-edge-"+e.parent+"-"+e.child,
			"demo-"+e.parent, "demo-"+e.child, e.rel, boolToInt(e.nameSource)); err != nil {
			return fmt.Errorf("seed edge %s->%s: %w", e.parent, e.child, err)
		}
	}
	for _, u := range unions {
		if _, err := db.ExecContext(ctx,
			`INSERT INTO unions (id, partner_a_id, partner_b_id, union_type, status)
			VALUES (?, ?, ?, ?, ?)`,
			"demo-union-"+u.a+"-"+u.b, "demo-"+u.a, "demo-"+u.b, u.kind, u.status); err != nil {
			return fmt.Errorf("seed union %s-%s: %w", u.a, u.b, err)
		}
	}
	if _, err := db.ExecContext(ctx,
		`INSERT INTO alternate_names (id, individual_id, name_type, name_native, name_latin, note)
		VALUES ('demo-alt-1', 'demo-dawit', 'BAPTISMAL', 'ገብረማርያም', 'Gebremariam', 'Baptismal name'),
			('demo-alt-2', 'demo-hana', 'NICKNAME', NULL, 'Hani', NULL)`); err != nil {
		return fmt.Errorf("seed alternate names: %w", err)
	}
	if _, err := db.ExecContext(ctx,
		`INSERT INTO individual_events (id, individual_id, event_type, event_date_gc, event_year_ec, event_place, description)
		VALUES ('demo-ev-1', 'demo-yonas', 'GRADUATION', '1998-07-07', 1990, 'Addis Ababa', 'University graduation'),
			('demo-ev-2', 'demo-tesfaye', 'FUNERAL', '2009-10-19', 2002, 'Gondar', NULL)`); err != nil {
		return fmt.Errorf("seed events: %w", err)
	}
	return nil
}

func nullInt(v int) any {
	if v == 0 {
		return nil
	}
	return v
}

func nullStr(v string) any {
	if v == "" {
		return nil
	}
	return v
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
