// Package calendar wraps ethioqen-go conversions between Ethiopian and
// Gregorian dates. All calendar math stays inside the library, this package
// only adapts its results to zer shapes.
package calendar

import (
	"fmt"

	ethioqen "github.com/beabzk/ethioqen-go"
)

// Date holds one day expressed in both calendars.
type Date struct {
	YearEC  int `json:"year_ec"`
	MonthEC int `json:"month_ec"`
	DayEC   int `json:"day_ec"`
	YearGC  int `json:"year_gc"`
	MonthGC int `json:"month_gc"`
	DayGC   int `json:"day_gc"`
}

// FromEC converts Ethiopian coordinates to Gregorian. Invalid coordinates
// return the library validation error.
func FromEC(yearEC, monthEC, dayEC int) (Date, error) {
	greg, err := ethioqen.ConvertEthiopianToGregorian(yearEC, monthEC, dayEC)
	if err != nil {
		return Date{}, err
	}
	return Date{
		YearEC:  yearEC,
		MonthEC: monthEC,
		DayEC:   dayEC,
		YearGC:  greg.Year,
		MonthGC: greg.Month,
		DayGC:   greg.Day,
	}, nil
}

// FromGC converts Gregorian coordinates to Ethiopian. Invalid coordinates
// return the library validation error.
func FromGC(yearGC, monthGC, dayGC int) (Date, error) {
	eth, err := ethioqen.ConvertGregorianToEthiopian(yearGC, monthGC, dayGC)
	if err != nil {
		return Date{}, err
	}
	return Date{
		YearEC:  eth.Year,
		MonthEC: eth.Month,
		DayEC:   eth.Day,
		YearGC:  yearGC,
		MonthGC: monthGC,
		DayGC:   dayGC,
	}, nil
}

// FormatGC renders the Gregorian side as YYYY-MM-DD for storage columns
// such as birth_date_gc.
func (d Date) FormatGC() string {
	return fmt.Sprintf("%04d-%02d-%02d", d.YearGC, d.MonthGC, d.DayGC)
}

// ValidatePartialEC range-checks any subset of Ethiopian coordinates.
// A full trio still needs FromEC for leap-accurate validation. Pagume day
// without a year allows up to 6, the leap maximum.
func ValidatePartialEC(yearEC, monthEC, dayEC *int) error {
	if yearEC != nil && *yearEC < 1 {
		return fmt.Errorf("EC year must be positive")
	}
	if monthEC != nil && (*monthEC < 1 || *monthEC > 13) {
		return fmt.Errorf("EC month must be 1 to 13")
	}
	if dayEC != nil {
		max := 30
		if monthEC != nil && *monthEC == 13 {
			max = 6
		}
		if *dayEC < 1 || *dayEC > max {
			return fmt.Errorf("EC day out of range for the month")
		}
	}
	return nil
}

// IsLeapEC reports whether an Ethiopian year holds a sixth Pagume day.
func IsLeapEC(yearEC int) bool {
	return ethioqen.IsEthiopianLeapYear(yearEC)
}

// DaysInMonthEC returns the day count for an Ethiopian month, Pagume
// included. It returns an error for invalid input.
func DaysInMonthEC(yearEC, monthEC int) (int, error) {
	return ethioqen.GetEthiopianMonthLength(yearEC, monthEC)
}
