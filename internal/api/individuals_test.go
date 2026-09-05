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
