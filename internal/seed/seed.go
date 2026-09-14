// Package seed builds deterministic demo family trees. The fixtures are
// committed as code, cover the domain model edge cases, and double as
// shared test data. All names are fictional. Demo accounts share one
// published password, valid for local exploration only.
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

// DemoPassword logs into every seeded demo account. Local use only.
const DemoPassword = "Demo1234"

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

type altName struct {
	key, person, kind, native, latin, note string
}

type event struct {
	key, person, kind, dateGC string
	yearEC                    int
	place, note               string
}

type fixture struct {
	name, slug, description, owner, ownerEmail string
	people                                     []person
	edges                                      []edge
	unions                                     []union
	alts                                       []altName
	events                                     []event
}

var fixtures = []fixture{
	{
		name: "Haile Lineage", slug: "haile-lineage",
		description: "Four-generation patronymic family",
		owner:       "Haile", ownerEmail: "haile@demo.example.com",
		people: []person{
			{key: "haile", native: "ሃይለ", latin: "Haile", gender: "MALE",
				titles: []string{"Ato"}, birth: [3]int{1908, 5, 10}, death: [3]int{1995, 1, 20},
				deceased: true, place: "Gondar"},
			{key: "mulu", native: "ሙሉ", latin: "Mulu", gender: "FEMALE",
				birth: [3]int{1915, 8, 12}, place: "Gondar"},
			{key: "girma", native: "ግርማ", latin: "Girma", gender: "MALE",
				birth: [3]int{1940, 3, 14}, place: "Addis Ababa"},
			{key: "tadelech", native: "ታደለች", latin: "Tadelech", gender: "FEMALE",
				birth: [3]int{1945, 10, 5}},
			{key: "abebe", native: "አበበ", latin: "Abebe", gender: "MALE",
				birth: [3]int{1970, 6, 18}},
			{key: "worku", native: "ወርቁ", latin: "Worku", gender: "MALE",
				birth: [3]int{1972, 2, 25}},
			{key: "genet", native: "ገነት", latin: "Genet", gender: "FEMALE",
				birth: [3]int{1975, 12, 8}},
			{key: "desta", native: "ደስታ", latin: "Desta", gender: "FEMALE",
				birth: [3]int{1973, 7, 7}},
			{key: "tirunesh", native: "ጥሩነሽ", latin: "Tirunesh", gender: "FEMALE",
				birth: [3]int{1998, 4, 16}},
			{key: "yared", native: "ያሬድ", latin: "Yared", gender: "MALE",
				birth: [3]int{2000, 9, 30}},
		},
		edges: []edge{
			{"haile", "girma", "BIOLOGICAL", true},
			{"mulu", "girma", "BIOLOGICAL", false},
			{"girma", "abebe", "BIOLOGICAL", true},
			{"tadelech", "abebe", "BIOLOGICAL", false},
			{"girma", "worku", "BIOLOGICAL", true},
			{"tadelech", "worku", "BIOLOGICAL", false},
			{"girma", "genet", "BIOLOGICAL", true},
			{"tadelech", "genet", "BIOLOGICAL", false},
			{"abebe", "tirunesh", "BIOLOGICAL", true},
			{"desta", "tirunesh", "BIOLOGICAL", false},
			{"abebe", "yared", "BIOLOGICAL", true},
			{"desta", "yared", "BIOLOGICAL", false},
		},
		unions: []union{
			{"haile", "mulu", "TRADITIONAL", "WIDOWED"},
			{"girma", "tadelech", "TRADITIONAL", "ACTIVE"},
			{"abebe", "desta", "TRADITIONAL", "ACTIVE"},
		},
		events: []event{
			{key: "ev-worku-grad", person: "worku", kind: "GRADUATION",
				dateGC: "2002-06-27", yearEC: 1994, place: "Addis Ababa", note: "University graduation"},
		},
	},
	{
		name: "Senait Line", slug: "senait-line",
		description: "Matronymic-led family with partial dates",
		owner:       "Senait", ownerEmail: "senait@demo.example.com",
		people: []person{
			{key: "zewditu", native: "ዘውዲቱ", latin: "Zewditu", gender: "FEMALE",
				birth: [3]int{1925, 2, 14}, death: [3]int{2010, 5, 6}, deceased: true},
			{key: "assefa", native: "አሰፋ", latin: "Assefa", gender: "MALE",
				birth: [3]int{1920, 11, 23}},
			{key: "senait", native: "ሰናይት", latin: "Senait", gender: "FEMALE",
				birth: [3]int{1950, 4, 11}},
			{key: "dereje", native: "ደረጄ", latin: "Dereje", gender: "MALE",
				birth: [3]int{1948, 6, 30}},
			{key: "mahlet", native: "ማህሌት", latin: "Mahlet", gender: "FEMALE",
				birth: [3]int{1978, 1, 17}},
			{key: "samuel", native: "ሳሙኤል", latin: "Samuel", gender: "MALE",
				birth: [3]int{1980, 8, 9}},
			{key: "meseret", native: "መሰረት", latin: "Meseret", gender: "MALE",
				birth: [3]int{1975, 12, 2}},
			{key: "ruth", native: "ሩት", latin: "Ruth", gender: "FEMALE",
				birth: [3]int{2005, 3, 21}},
			{key: "sara", native: "ሳራ", latin: "Sara", gender: "FEMALE",
				birth: [3]int{2008, 0, 0}},
		},
		edges: []edge{
			{"zewditu", "senait", "BIOLOGICAL", true},
			{"assefa", "senait", "BIOLOGICAL", false},
			{"senait", "mahlet", "BIOLOGICAL", true},
			{"dereje", "mahlet", "BIOLOGICAL", false},
			{"senait", "samuel", "BIOLOGICAL", true},
			{"dereje", "samuel", "BIOLOGICAL", false},
			{"mahlet", "ruth", "BIOLOGICAL", true},
			{"meseret", "ruth", "BIOLOGICAL", false},
			{"mahlet", "sara", "BIOLOGICAL", true},
			{"meseret", "sara", "BIOLOGICAL", false},
		},
		unions: []union{
			{"zewditu", "assefa", "TRADITIONAL", "WIDOWED"},
			{"senait", "dereje", "CIVIL", "ACTIVE"},
			{"mahlet", "meseret", "CIVIL", "ACTIVE"},
		},
		alts: []altName{
			{key: "alt-samuel", person: "samuel", kind: "BAPTISMAL",
				native: "ገብረሕይወት", latin: "Gebrehiwot", note: "Baptismal name"},
		},
	},
	{
		name: "Adoptive Household", slug: "adoptive-household",
		description: "Adoptive, foster, and half-sibling relations",
		owner:       "Wondimu", ownerEmail: "wondimu@demo.example.com",
		people: []person{
			{key: "wondimu", native: "ወንድሙ", latin: "Wondimu", gender: "MALE",
				birth: [3]int{1960, 7, 7}},
			{key: "hirut", native: "ሂሩት", latin: "Hirut", gender: "FEMALE",
				birth: [3]int{1965, 9, 19}},
			{key: "tsegaye", native: "ፀጋዬ", latin: "Tsegaye", gender: "MALE",
				birth: [3]int{1958, 4, 4}},
			{key: "netsanet", native: "ነጻነት", latin: "Netsanet", gender: "FEMALE",
				birth: [3]int{1990, 2, 28}},
			{key: "amare", native: "አማረ", latin: "Amare", gender: "MALE",
				birth: [3]int{1985, 3, 3}},
			{key: "muluken", native: "ሙሉቀን", latin: "Muluken", gender: "MALE",
				birth: [3]int{1988, 10, 10}},
			{key: "frehiwot", native: "ፍሬሕይወት", latin: "Frehiwot", gender: "FEMALE",
				birth: [3]int{1992, 0, 0}},
			{key: "eyob", native: "እዮብ", latin: "Eyob", gender: "MALE",
				birth: [3]int{1995, 12, 0}},
			{key: "belay", native: "በላይ", latin: "Belay", gender: "MALE",
				birth: [3]int{2015, 6, 15}},
		},
		edges: []edge{
			{"wondimu", "netsanet", "BIOLOGICAL", true},
			{"hirut", "netsanet", "BIOLOGICAL", false},
			{"tsegaye", "muluken", "BIOLOGICAL", false},
			{"hirut", "muluken", "BIOLOGICAL", false},
			{"wondimu", "muluken", "ADOPTIVE", true},
			{"wondimu", "frehiwot", "ADOPTIVE", false},
			{"hirut", "frehiwot", "ADOPTIVE", true},
			{"wondimu", "eyob", "FOSTER", false},
			{"hirut", "eyob", "FOSTER", false},
			{"netsanet", "belay", "BIOLOGICAL", true},
			{"amare", "belay", "BIOLOGICAL", false},
		},
		unions: []union{
			{"wondimu", "hirut", "TRADITIONAL", "ACTIVE"},
			{"hirut", "tsegaye", "RELIGIOUS", "DISSOLVED"},
			{"netsanet", "amare", "CIVIL", "ACTIVE"},
		},
		alts: []altName{
			{key: "alt-eyob", person: "eyob", kind: "NICKNAME",
				native: "", latin: "Eyobi", note: ""},
		},
		events: []event{
			{key: "ev-muluken", person: "muluken", kind: "ADOPTION",
				dateGC: "1996-09-11", yearEC: 1989, place: "Addis Ababa", note: ""},
		},
	},
	{
		name: "Blended Remarriage", slug: "blended-remarriage",
		description: "Sequential unions with half-siblings",
		owner:       "Rahel", ownerEmail: "rahel@demo.example.com",
		people: []person{
			{key: "solomon", native: "ሰለሞን", latin: "Solomon", gender: "MALE",
				birth: [3]int{1955, 5, 5}},
			{key: "bethlehem", native: "ቤተልሔም", latin: "Bethlehem", gender: "FEMALE",
				birth: [3]int{1958, 2, 2}},
			{key: "rahel", native: "ራሔል", latin: "Rahel", gender: "FEMALE",
				birth: [3]int{1960, 8, 14}},
			{key: "kifle", native: "ክፍሌ", latin: "Kifle", gender: "MALE",
				birth: [3]int{1955, 11, 30}},
			{key: "shiferaw", native: "ሽፈራው", latin: "Shiferaw", gender: "MALE",
				birth: [3]int{1980, 7, 11}},
			{key: "konjit", native: "ቆንጂት", latin: "Konjit", gender: "FEMALE",
				birth: [3]int{1983, 9, 9}},
			{key: "alemitu", native: "አለሚቱ", latin: "Alemitu", gender: "FEMALE",
				birth: [3]int{1995, 4, 22}},
			{key: "meron", native: "መሮን", latin: "Meron", gender: "FEMALE",
				birth: [3]int{1985, 10, 10}},
			{key: "endeshaw", native: "እንዳሻው", latin: "Endeshaw", gender: "MALE",
				birth: [3]int{2010, 1, 19}},
		},
		edges: []edge{
			{"solomon", "shiferaw", "BIOLOGICAL", true},
			{"bethlehem", "shiferaw", "BIOLOGICAL", false},
			{"rahel", "konjit", "BIOLOGICAL", true},
			{"kifle", "konjit", "BIOLOGICAL", false},
			{"solomon", "alemitu", "BIOLOGICAL", true},
			{"rahel", "alemitu", "BIOLOGICAL", false},
			{"shiferaw", "endeshaw", "BIOLOGICAL", true},
			{"meron", "endeshaw", "BIOLOGICAL", false},
		},
		unions: []union{
			{"solomon", "bethlehem", "RELIGIOUS", "DISSOLVED"},
			{"rahel", "kifle", "CIVIL", "DISSOLVED"},
			{"solomon", "rahel", "TRADITIONAL", "ACTIVE"},
			{"shiferaw", "meron", "TRADITIONAL", "ACTIVE"},
		},
	},
	{
		name: "Sparse Records", slug: "sparse-records",
		description: "Single parent with year-only dates and no unions",
		owner:       "Mekdes", ownerEmail: "mekdes@demo.example.com",
		people: []person{
			{key: "alganesh", native: "አልጋነሽ", latin: "Alganesh", gender: "FEMALE",
				birth: [3]int{1950, 0, 0}, death: [3]int{2020, 0, 0}, deceased: true},
			{key: "mekdes", native: "መቅደስ", latin: "Mekdes", gender: "FEMALE",
				birth: [3]int{1980, 0, 0}},
			{key: "teshome", native: "ተሾመ", latin: "Teshome", gender: "MALE",
				birth: [3]int{1978, 0, 0}},
			{key: "tsion", native: "ጽዮን", latin: "Tsion", gender: "FEMALE",
				birth: [3]int{2005, 0, 0}},
			{key: "nahom", native: "ናሆም", latin: "Nahom", gender: "MALE",
				birth: [3]int{2022, 0, 0}},
		},
		edges: []edge{
			{"alganesh", "mekdes", "BIOLOGICAL", true},
			{"alganesh", "teshome", "BIOLOGICAL", true},
			{"mekdes", "tsion", "BIOLOGICAL", true},
			{"tsion", "nahom", "BIOLOGICAL", true},
		},
		events: []event{
			{key: "ev-alganesh", person: "alganesh", kind: "FUNERAL",
				dateGC: "2028-01-09", yearEC: 2020, place: "", note: ""},
		},
	},
}

// SeededTree reports one created demo tree.
type SeededTree struct {
	Name   string
	Slug   string
	ID     string
	People int
}

// SeedAll creates every fixture tree with its owner account. It aborts
// before writing anything when any slug is taken. HashPassword hashes the
// demo password, injected so tests avoid real Argon2id runs.
func SeedAll(ctx context.Context, manager *database.Manager, hash func(string) (string, error)) ([]SeededTree, error) {
	master, err := manager.Master(ctx)
	if err != nil {
		return nil, err
	}
	for _, f := range fixtures {
		var n int
		if err := master.QueryRowContext(ctx,
			`SELECT COUNT(*) FROM trees WHERE slug = ?`, f.slug).Scan(&n); err != nil {
			return nil, err
		}
		if n > 0 {
			return nil, fmt.Errorf("seed: slug %q already exists", f.slug)
		}
	}
	var report []SeededTree
	for i := range fixtures {
		id, err := seedOne(ctx, manager, master, &fixtures[i], hash)
		if err != nil {
			return report, err
		}
		report = append(report, SeededTree{
			Name: fixtures[i].name, Slug: fixtures[i].slug,
			ID: id, People: len(fixtures[i].people),
		})
	}
	if _, err := master.ExecContext(ctx,
		`INSERT INTO instance_settings (
			id, signup_mode, default_invite_expiry_hours, setup_completed_at, updated_at
		) SELECT 1, 'OPEN', 168,
			strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
			strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
		WHERE NOT EXISTS (SELECT 1 FROM instance_settings WHERE id = 1)`); err != nil {
		return report, fmt.Errorf("seed instance settings: %w", err)
	}
	if _, err := master.ExecContext(ctx,
		`INSERT INTO instance_admins (user_id, granted_by, created_at)
		SELECT id, id, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
		FROM users WHERE email = 'haile@demo.example.com'
		AND NOT EXISTS (SELECT 1 FROM instance_admins)`); err != nil {
		return report, fmt.Errorf("seed instance admin: %w", err)
	}
	return report, nil
}

func seedOne(ctx context.Context, manager *database.Manager, master *sql.DB, f *fixture, hash func(string) (string, error)) (string, error) {
	hashed, err := hash(DemoPassword)
	if err != nil {
		return "", fmt.Errorf("seed %s password: %w", f.slug, err)
	}
	var userID int64
	if err := master.QueryRowContext(ctx,
		`SELECT id FROM users WHERE email = ?`, f.ownerEmail).Scan(&userID); err == sql.ErrNoRows {
		now := "2026-01-01T00:00:00Z"
		res, err := master.ExecContext(ctx,
			`INSERT INTO users (email, password, created_at, updated_at) VALUES (?, ?, ?, ?)`,
			f.ownerEmail, hashed, now, now)
		if err != nil {
			return "", fmt.Errorf("seed %s owner: %w", f.slug, err)
		}
		userID, err = res.LastInsertId()
		if err != nil {
			return "", fmt.Errorf("seed %s owner id: %w", f.slug, err)
		}
	} else if err != nil {
		return "", fmt.Errorf("seed %s owner lookup: %w", f.slug, err)
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
		treeID, f.name, f.slug, f.description, userID); err != nil {
		return "", fmt.Errorf("seed %s tree: %w", f.slug, err)
	}
	db, err := manager.Tree(ctx, treeID)
	if err != nil {
		return "", err
	}
	if err := fillTree(ctx, db, f); err != nil {
		return "", err
	}
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO tree_members (id, tree_id, user_id, role) VALUES (?, ?, ?, 'OWNER')`,
		uuid.NewString(), treeID, userID); err != nil {
		return "", fmt.Errorf("seed %s membership: %w", f.slug, err)
	}
	if err := tx.Commit(); err != nil {
		return "", err
	}
	committed = true
	return treeID, nil
}

func fillTree(ctx context.Context, db *sql.DB, f *fixture) error {
	prefix := f.slug + "-"
	for _, p := range f.people {
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
		if p.deceased && p.death[0] != 0 && p.death[1] != 0 && p.death[2] != 0 {
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
			prefix+p.key, p.native, p.latin, p.gender, titles,
			nullInt(p.birth[0]), nullInt(p.birth[1]), nullInt(p.birth[2]), birthGC, nullStr(p.place),
			boolToInt(p.deceased),
			nullInt(p.death[0]), nullInt(p.death[1]), nullInt(p.death[2]), deathGC); err != nil {
			return fmt.Errorf("seed %s: %w", p.key, err)
		}
	}
	for _, e := range f.edges {
		if err := lineage.ValidateParentLink(ctx, db, prefix+e.parent, prefix+e.child); err != nil {
			return fmt.Errorf("seed edge %s->%s: %w", e.parent, e.child, err)
		}
		if _, err := db.ExecContext(ctx,
			`INSERT INTO parent_child (id, parent_id, child_id, relationship_type, is_name_source)
			VALUES (?, ?, ?, ?, ?)`,
			prefix+"edge-"+e.parent+"-"+e.child,
			prefix+e.parent, prefix+e.child, e.rel, boolToInt(e.nameSource)); err != nil {
			return fmt.Errorf("seed edge %s->%s: %w", e.parent, e.child, err)
		}
	}
	for _, u := range f.unions {
		if _, err := db.ExecContext(ctx,
			`INSERT INTO unions (id, partner_a_id, partner_b_id, union_type, status)
			VALUES (?, ?, ?, ?, ?)`,
			prefix+"union-"+u.a+"-"+u.b, prefix+u.a, prefix+u.b, u.kind, u.status); err != nil {
			return fmt.Errorf("seed union %s-%s: %w", u.a, u.b, err)
		}
	}
	for _, a := range f.alts {
		if _, err := db.ExecContext(ctx,
			`INSERT INTO alternate_names (id, individual_id, name_type, name_native, name_latin, note)
			VALUES (?, ?, ?, ?, ?, ?)`,
			prefix+"alt-"+a.key, prefix+a.person, a.kind,
			nullStr(a.native), nullStr(a.latin), nullStr(a.note)); err != nil {
			return fmt.Errorf("seed alt name %s: %w", a.key, err)
		}
	}
	for _, ev := range f.events {
		if _, err := db.ExecContext(ctx,
			`INSERT INTO individual_events (id, individual_id, event_type, event_date_gc, event_year_ec, event_place, description)
			VALUES (?, ?, ?, ?, ?, ?, ?)`,
			prefix+"ev-"+ev.key, prefix+ev.person, ev.kind, ev.dateGC, ev.yearEC,
			nullStr(ev.place), nullStr(ev.note)); err != nil {
			return fmt.Errorf("seed event %s: %w", ev.key, err)
		}
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
