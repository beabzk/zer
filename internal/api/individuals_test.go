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

func TestListAndSearchIndividuals(t *testing.T) {
	_, _, r := testSetup(t, 1)
	treeID := createTree(t, r, "Search")

	createPerson(t, r, treeID, map[string]any{
		"given_name_native": "N1", "given_name_latin": "Abebe", "gender": "MALE"})
	createPerson(t, r, treeID, map[string]any{
		"given_name_native": "N2", "given_name_latin": "Almaz", "gender": "FEMALE"})

	rec := doRequest(t, r, http.MethodGet, "/api/v1/trees/"+treeID+"/individuals", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("list: status = %d", rec.Code)
	}
	var all []map[string]any
	decodeBody(t, rec, &all)
	if len(all) != 2 {
		t.Fatalf("list count = %d, want 2", len(all))
	}

	rec = doRequest(t, r, http.MethodGet, "/api/v1/trees/"+treeID+"/individuals?q=Alm", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("search: status = %d", rec.Code)
	}
	var found []map[string]any
	decodeBody(t, rec, &found)
	if len(found) != 1 || found[0]["full_latin"] != "Almaz" {
		t.Fatalf("search result: %+v", found)
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
