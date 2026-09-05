package calendar

import (
	"testing"

	ethioqen "github.com/beabzk/ethioqen-go"
)

func TestFromECKnownPair(t *testing.T) {
	d, err := FromEC(2016, 7, 6)
	if err != nil {
		t.Fatal(err)
	}
	if d.YearGC != 2024 || d.MonthGC != 3 || d.DayGC != 15 {
		t.Errorf("got %v, want 2024-03-15", d.FormatGC())
	}
}

func TestFromGCKnownPair(t *testing.T) {
	d, err := FromGC(2024, 3, 15)
	if err != nil {
		t.Fatal(err)
	}
	if d.YearEC != 2016 || d.MonthEC != 7 || d.DayEC != 6 {
		t.Errorf("got %d-%d-%d, want 2016-7-6", d.YearEC, d.MonthEC, d.DayEC)
	}
}

func TestRoundTrip(t *testing.T) {
	for _, ec := range [][3]int{{1985, 4, 12}, {2015, 13, 6}, {2000, 1, 1}, {1990, 9, 29}} {
		fwd, err := FromEC(ec[0], ec[1], ec[2])
		if err != nil {
			t.Fatal(err)
		}
		back, err := FromGC(fwd.YearGC, fwd.MonthGC, fwd.DayGC)
		if err != nil {
			t.Fatal(err)
		}
		if back.YearEC != ec[0] || back.MonthEC != ec[1] || back.DayEC != ec[2] {
			t.Errorf("round trip of %v gave %d-%d-%d", ec, back.YearEC, back.MonthEC, back.DayEC)
		}
	}
}

func TestRejectsInvalidDates(t *testing.T) {
	if _, err := FromEC(2016, 14, 1); err == nil {
		t.Error("expected error for month 14")
	}
	if _, err := FromEC(2016, 13, 6); err == nil {
		t.Error("expected error for Pagume day 6 in common year 2016")
	}
	if _, err := FromEC(2015, 13, 6); err != nil {
		t.Errorf("Pagume 6 is valid in leap year 2015: %v", err)
	}
	if _, err := FromGC(2023, 2, 29); err == nil {
		t.Error("expected error for 2023-02-29")
	}
	if !ethioqen.IsInvalidDate(mustFail(t)) {
		t.Error("expected InvalidDateError classification")
	}
}

func mustFail(t *testing.T) error {
	t.Helper()
	_, err := FromGC(2023, 2, 29)
	if err == nil {
		t.Fatal("expected conversion error")
	}
	return err
}

func TestLeapAndMonthLength(t *testing.T) {
	if !IsLeapEC(2015) {
		t.Error("2015 EC is a leap year")
	}
	if IsLeapEC(2016) {
		t.Error("2016 EC is not a leap year")
	}
	days, err := DaysInMonthEC(2015, 13)
	if err != nil {
		t.Fatal(err)
	}
	if days != 6 {
		t.Errorf("Pagume 2015 has %d days, want 6", days)
	}
	days, err = DaysInMonthEC(2016, 13)
	if err != nil {
		t.Fatal(err)
	}
	if days != 5 {
		t.Errorf("Pagume 2016 has %d days, want 5", days)
	}
}

func TestFormatGC(t *testing.T) {
	d, err := FromEC(2016, 7, 6)
	if err != nil {
		t.Fatal(err)
	}
	if got := d.FormatGC(); got != "2024-03-15" {
		t.Errorf("FormatGC = %s, want 2024-03-15", got)
	}
}
