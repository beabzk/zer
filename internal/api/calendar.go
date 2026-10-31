package api

import (
	"fmt"
	"net/http"
	"strconv"

	"github.com/beabzk/zer/internal/calendar"
)

type calendarConvertResponse struct {
	YearEC  int    `json:"year_ec"`
	MonthEC int    `json:"month_ec"`
	DayEC   int    `json:"day_ec"`
	YearGC  int    `json:"year_gc"`
	MonthGC int    `json:"month_gc"`
	DayGC   int    `json:"day_gc"`
	DateGC  string `json:"date_gc"`
}

func (d Deps) handleCalendarConvert(w http.ResponseWriter, r *http.Request) {
	mode := r.URL.Query().Get("mode")
	switch mode {
	case "ec_to_gc":
		y, err1 := strconv.Atoi(r.URL.Query().Get("year"))
		m, err2 := strconv.Atoi(r.URL.Query().Get("month"))
		day, err3 := strconv.Atoi(r.URL.Query().Get("day"))
		if err1 != nil || err2 != nil || err3 != nil {
			writeError(w, http.StatusBadRequest, "invalid EC date parameters")
			return
		}
		res, err := calendar.FromEC(y, m, day)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, calendarConvertResponse{
			YearEC:  res.YearEC,
			MonthEC: res.MonthEC,
			DayEC:   res.DayEC,
			YearGC:  res.YearGC,
			MonthGC: res.MonthGC,
			DayGC:   res.DayGC,
			DateGC:  res.FormatGC(),
		})
	case "gc_to_ec":
		gcStr := r.URL.Query().Get("date")
		var gy, gm, gd int
		if _, err := fmt.Sscanf(gcStr, "%d-%d-%d", &gy, &gm, &gd); err != nil {
			writeError(w, http.StatusBadRequest, "invalid GC date format, want YYYY-MM-DD")
			return
		}
		res, err := calendar.FromGC(gy, gm, gd)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, calendarConvertResponse{
			YearEC:  res.YearEC,
			MonthEC: res.MonthEC,
			DayEC:   res.DayEC,
			YearGC:  res.YearGC,
			MonthGC: res.MonthGC,
			DayGC:   res.DayGC,
			DateGC:  res.FormatGC(),
		})
	default:
		writeError(w, http.StatusBadRequest, "invalid mode: want ec_to_gc or gc_to_ec")
	}
}
