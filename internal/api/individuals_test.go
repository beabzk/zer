package api

import (
	"net/http"
	"testing"

	"github.com/go-chi/chi/v5"
)

func createPerson(t *testing.T, r chi.Router, treeID string, body map[string]any) string {
	t.Helper()
	rec := doRequest(t, r, http.MethodPost, "/api/v1/trees/"+treeID+"/individuals", body)
	if rec.Code != http.StatusOK && rec.Code != http.StatusCreated {
		t.Fatalf("create person: status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var row map[string]any
	decodeBody(t, rec, &row)
	id, _ := row["id"].(string)
	if id == "" {
		t.Fatalf("missing id in %+v", row)
	}
	return id
}

func getPerson(t *testing.T, r chi.Router, treeID, id, query string) map[string]any {
	t.Helper()
	rec := doRequest(t, r, http.MethodGet, "/api/v1/trees/"+treeID+"/individuals/"+id+query, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("get person: status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var row map[string]any
	decodeBody(t, rec, &row)
	return row
}

func TestCreateAndGetIndividual(t *testing.T) {
	_, _, r := testSetup(t, 1)
	treeID := createTree(t, r, "Solo")

	id := createPerson(t, r, treeID, map[string]any{
		"given_name_native": "Native", "given_name_latin": "Latin", "gender": "FEMALE",
	})
	row := getPerson(t, r, treeID, id, "")
	if row["full_latin"] != "Latin" || row["full_native"] != "Native" {
		t.Errorf("unexpected synthesized names: %+v", row)
	}
}

func TestCreateIndividualValidation(t *testing.T) {
	_, _, r := testSetup(t, 1)
	treeID := createTree(t, r, "Valid")

	for _, body := range []map[string]any{
		{"given_name_latin": "L", "gender": "MALE"},
		{"given_name_native": "N", "given_name_latin": "L", "gender": "UNKNOWN"},
		{"given_name_native": "N", "given_name_latin": "L", "gender": "MALE",
			"birth_year_ec": 2016, "birth_month_ec": 13, "birth_day_ec": 6},
		{"given_name_native": "N", "given_name_latin": "L", "gender": "MALE",
			"birth_date_gc": "2023-02-29"},
	} {
		rec := doRequest(t, r, http.MethodPost, "/api/v1/trees/"+treeID+"/individuals", body)
		if rec.Code != http.StatusBadRequest {
			t.Errorf("body %+v: status = %d, want 400", body, rec.Code)
		}
	}
}

func TestECBirthDerivesGC(t *testing.T) {
	_, _, r := testSetup(t, 1)
	treeID := createTree(t, r, "Dates")

	id := createPerson(t, r, treeID, map[string]any{
		"given_name_native": "N", "given_name_latin": "L", "gender": "MALE",
		"birth_year_ec": 2016, "birth_month_ec": 7, "birth_day_ec": 6,
	})
	row := getPerson(t, r, treeID, id, "")
	if row["birth_date_gc"] != "2024-03-15" {
		t.Errorf("birth_date_gc = %v, want 2024-03-15", row["birth_date_gc"])
	}
}

func TestUpdateAndDeleteIndividual(t *testing.T) {
	_, _, r := testSetup(t, 1)
	treeID := createTree(t, r, "Crud")

	id := createPerson(t, r, treeID, map[string]any{
		"given_name_native": "N", "given_name_latin": "L", "gender": "MALE",
	})
	rec := doRequest(t, r, http.MethodPut, "/api/v1/trees/"+treeID+"/individuals/"+id,
		map[string]any{"birth_place": "Addis Ababa", "gender": "FEMALE"})
	if rec.Code != http.StatusOK {
		t.Fatalf("update: status = %d, body = %s", rec.Code, rec.Body.String())
	}
	row := getPerson(t, r, treeID, id, "")
	if row["birth_place"] != "Addis Ababa" || row["gender"] != "FEMALE" {
		t.Errorf("update not applied: %+v", row)
	}

	rec = doRequest(t, r, http.MethodPut, "/api/v1/trees/"+treeID+"/individuals/"+id,
		map[string]any{"gender": "NOPE"})
	if rec.Code != http.StatusBadRequest {
		t.Errorf("bad gender: status = %d, want 400", rec.Code)
	}

	rec = doRequest(t, r, http.MethodDelete, "/api/v1/trees/"+treeID+"/individuals/"+id, nil)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("delete: status = %d", rec.Code)
	}
	rec = doRequest(t, r, http.MethodGet, "/api/v1/trees/"+treeID+"/individuals/"+id, nil)
	if rec.Code != http.StatusNotFound {
		t.Errorf("get after delete: status = %d, want 404", rec.Code)
	}
}

func getDirectory(t *testing.T, r chi.Router, treeID, query string) (int, map[string]any) {
	t.Helper()
	rec := doRequest(t, r, http.MethodGet, "/api/v1/trees/"+treeID+"/individuals"+query, nil)
	var body map[string]any
	decodeBody(t, rec, &body)
	return rec.Code, body
}

func directoryNames(t *testing.T, body map[string]any) []string {
	t.Helper()
	items, _ := body["individuals"].([]any)
	names := []string{}
	for _, item := range items {
		row, _ := item.(map[string]any)
		name, _ := row["full_latin"].(string)
		names = append(names, name)
	}
	return names
}

func TestListAndSearchIndividuals(t *testing.T) {
	_, _, r := testSetup(t, 1)
	treeID := createTree(t, r, "Search")

	createPerson(t, r, treeID, map[string]any{
		"given_name_native": "N1", "given_name_latin": "Abebe", "gender": "MALE"})
	createPerson(t, r, treeID, map[string]any{
		"given_name_native": "N2", "given_name_latin": "Aster", "gender": "FEMALE"})

	code, all := getDirectory(t, r, treeID, "")
	if code != http.StatusOK {
		t.Fatalf("list: status = %d", code)
	}
	if all["total"] != float64(2) || all["limit"] != float64(50) || all["offset"] != float64(0) {
		t.Fatalf("list meta: %+v", all)
	}
	if names := directoryNames(t, all); len(names) != 2 {
		t.Fatalf("list count = %d, want 2", len(names))
	}

	code, found := getDirectory(t, r, treeID, "?q=Ast")
	if code != http.StatusOK {
		t.Fatalf("search: status = %d", code)
	}
	if names := directoryNames(t, found); len(names) != 1 || names[0] != "Aster" {
		t.Fatalf("search result: %+v", names)
	}
	if found["total"] != float64(1) {
		t.Fatalf("search total: %+v", found)
	}

	code, none := getDirectory(t, r, treeID, "?q=Zzz")
	if code != http.StatusOK {
		t.Fatalf("empty search: status = %d", code)
	}
	if none["total"] != float64(0) || len(directoryNames(t, none)) != 0 {
		t.Fatalf("empty search: %+v", none)
	}
}

func TestDirectoryPagination(t *testing.T) {
	_, _, r := testSetup(t, 1)
	treeID := createTree(t, r, "Pages")

	for _, name := range []string{"A-one", "B-two", "C-three", "D-four", "E-five"} {
		createPerson(t, r, treeID, map[string]any{
			"given_name_native": "N-" + name, "given_name_latin": name, "gender": "MALE"})
	}

	code, first := getDirectory(t, r, treeID, "?limit=2&offset=0&order=name")
	if code != http.StatusOK {
		t.Fatalf("page one: status = %d", code)
	}
	if names := directoryNames(t, first); len(names) != 2 || names[0] != "A-one" || names[1] != "B-two" {
		t.Fatalf("page one: %+v", names)
	}
	if first["total"] != float64(5) || first["limit"] != float64(2) || first["offset"] != float64(0) {
		t.Fatalf("page one meta: %+v", first)
	}

	code, second := getDirectory(t, r, treeID, "?limit=2&offset=2&order=name")
	if code != http.StatusOK {
		t.Fatalf("page two: status = %d", code)
	}
	if names := directoryNames(t, second); len(names) != 2 || names[0] != "C-three" || names[1] != "D-four" {
		t.Fatalf("page two: %+v", names)
	}

	code, tail := getDirectory(t, r, treeID, "?limit=2&offset=4&order=name")
	if code != http.StatusOK {
		t.Fatalf("tail: status = %d", code)
	}
	if names := directoryNames(t, tail); len(names) != 1 || names[0] != "E-five" {
		t.Fatalf("tail: %+v", names)
	}

	code, past := getDirectory(t, r, treeID, "?limit=2&offset=9")
	if code != http.StatusOK {
		t.Fatalf("past end: status = %d", code)
	}
	if past["total"] != float64(5) || len(directoryNames(t, past)) != 0 {
		t.Fatalf("past end: %+v", past)
	}
}

func TestDirectoryOrdering(t *testing.T) {
	_, _, r := testSetup(t, 1)
	treeID := createTree(t, r, "Order")

	createPerson(t, r, treeID, map[string]any{
		"given_name_native": "N-Z", "given_name_latin": "Zola", "gender": "MALE"})
	early := createPerson(t, r, treeID, map[string]any{
		"given_name_native": "N-A", "given_name_latin": "Abebe", "gender": "MALE"})
	if rec := doRequest(t, r, http.MethodPut, "/api/v1/trees/"+treeID+"/individuals/"+early,
		map[string]any{"birth_place": "Harar"}); rec.Code != http.StatusOK {
		t.Fatalf("update: status = %d", rec.Code)
	}

	code, byName := getDirectory(t, r, treeID, "?order=name")
	if code != http.StatusOK {
		t.Fatalf("name order: status = %d", code)
	}
	if names := directoryNames(t, byName); len(names) != 2 || names[0] != "Abebe" || names[1] != "Zola" {
		t.Fatalf("name order: %+v", names)
	}

	code, recent := getDirectory(t, r, treeID, "?order=recent")
	if code != http.StatusOK {
		t.Fatalf("recent order: status = %d", code)
	}
	if names := directoryNames(t, recent); len(names) != 2 || names[0] != "Abebe" {
		t.Fatalf("recent order: %+v, want updated Abebe first", names)
	}

	code, created := getDirectory(t, r, treeID, "")
	if code != http.StatusOK {
		t.Fatalf("default order: status = %d", code)
	}
	if names := directoryNames(t, created); len(names) != 2 || names[0] != "Zola" || names[1] != "Abebe" {
		t.Fatalf("default order: %+v, want insertion order", names)
	}
}

func TestDirectoryValidation(t *testing.T) {
	_, _, r := testSetup(t, 1)
	treeID := createTree(t, r, "DirValid")

	for _, query := range []string{"?limit=0", "?limit=-2", "?limit=abc", "?limit=201",
		"?offset=-1", "?offset=abc", "?order=bogus"} {
		if code, _ := getDirectory(t, r, treeID, query); code != http.StatusBadRequest {
			t.Errorf("query %s: status = %d, want 400", query, code)
		}
	}
}

func TestPartialECBirth(t *testing.T) {
	_, _, r := testSetup(t, 1)
	treeID := createTree(t, r, "Partial")

	id := createPerson(t, r, treeID, map[string]any{
		"given_name_native": "N", "given_name_latin": "L", "gender": "MALE",
		"birth_year_ec": 2018,
	})
	row := getPerson(t, r, treeID, id, "")
	if row["birth_year_ec"] != float64(2018) {
		t.Errorf("birth year = %v, want 2018", row["birth_year_ec"])
	}
	for _, key := range []string{"birth_month_ec", "birth_day_ec", "birth_date_gc"} {
		if row[key] != nil {
			t.Errorf("%s = %v, want null", key, row[key])
		}
	}
}

func TestPartialECValidation(t *testing.T) {
	_, _, r := testSetup(t, 1)
	treeID := createTree(t, r, "PartialInvalid")
	base := map[string]any{
		"given_name_native": "N", "given_name_latin": "L", "gender": "MALE",
	}
	bad := []map[string]any{
		{"birth_month_ec": 14},
		{"birth_month_ec": 5, "birth_day_ec": 31},
		{"birth_month_ec": 0},
	}
	for _, extra := range bad {
		body := map[string]any{}
		for k, v := range base {
			body[k] = v
		}
		for k, v := range extra {
			body[k] = v
		}
		rec := doRequest(t, r, http.MethodPost, "/api/v1/trees/"+treeID+"/individuals", body)
		if rec.Code != http.StatusBadRequest {
			t.Errorf("body %+v: status = %d, want 400", extra, rec.Code)
		}
	}
	// Pagume day 6 without a year is allowed, leap resolves later.
	id := createPerson(t, r, treeID, map[string]any{
		"given_name_native": "N", "given_name_latin": "L", "gender": "MALE",
		"birth_month_ec": 13, "birth_day_ec": 6,
	})
	row := getPerson(t, r, treeID, id, "")
	if row["birth_day_ec"] != float64(6) {
		t.Errorf("pagume day = %v, want 6", row["birth_day_ec"])
	}
}

func TestUpdatePartialReplacesTrio(t *testing.T) {
	_, _, r := testSetup(t, 1)
	treeID := createTree(t, r, "Replace")

	id := createPerson(t, r, treeID, map[string]any{
		"given_name_native": "N", "given_name_latin": "L", "gender": "MALE",
		"birth_year_ec": 2016, "birth_month_ec": 7, "birth_day_ec": 6,
	})
	rec := doRequest(t, r, http.MethodPut, "/api/v1/trees/"+treeID+"/individuals/"+id,
		map[string]any{"birth_year_ec": 2018})
	if rec.Code != http.StatusOK {
		t.Fatalf("update: status = %d, body = %s", rec.Code, rec.Body.String())
	}
	row := getPerson(t, r, treeID, id, "")
	if row["birth_year_ec"] != float64(2018) {
		t.Errorf("birth year = %v, want 2018", row["birth_year_ec"])
	}
	for _, key := range []string{"birth_month_ec", "birth_day_ec", "birth_date_gc"} {
		if row[key] != nil {
			t.Errorf("%s = %v, want null after partial replace", key, row[key])
		}
	}
}

func TestClearDate(t *testing.T) {
	_, _, r := testSetup(t, 1)
	treeID := createTree(t, r, "Clear")

	id := createPerson(t, r, treeID, map[string]any{
		"given_name_native": "N", "given_name_latin": "L", "gender": "MALE",
		"birth_year_ec": 2016, "birth_month_ec": 7, "birth_day_ec": 6,
	})
	rec := doRequest(t, r, http.MethodPut, "/api/v1/trees/"+treeID+"/individuals/"+id,
		map[string]any{"clear_birth_date": true, "birth_year_ec": 2018})
	if rec.Code != http.StatusBadRequest {
		t.Errorf("clear with values: status = %d, want 400", rec.Code)
	}
	rec = doRequest(t, r, http.MethodPut, "/api/v1/trees/"+treeID+"/individuals/"+id,
		map[string]any{"clear_birth_date": true})
	if rec.Code != http.StatusOK {
		t.Fatalf("clear: status = %d, body = %s", rec.Code, rec.Body.String())
	}
	row := getPerson(t, r, treeID, id, "")
	for _, key := range []string{"birth_year_ec", "birth_month_ec", "birth_day_ec", "birth_date_gc"} {
		if row[key] != nil {
			t.Errorf("%s = %v, want null after clear", key, row[key])
		}
	}
}
