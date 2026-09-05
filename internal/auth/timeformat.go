package auth

import (
	"context"
	"time"

	"github.com/thecodearcher/limen"
)

// timeFormatAdapter wraps a Limen DatabaseAdapter and stores time.Time
// values as RFC3339Nano strings. modernc.org/sqlite binds time.Time in a
// layout the Limen SQL adapter cannot parse back, which breaks session
// reads that assert time.Time. RFC3339Nano parses through the adapter
// layouts and keeps lexicographic ordering for time comparisons.
type timeFormatAdapter struct {
	limen.DatabaseAdapter
}

func (a timeFormatAdapter) Create(ctx context.Context, table limen.SchemaTableName, data map[string]any) (limen.DatabaseResult, error) {
	return a.DatabaseAdapter.Create(ctx, table, formatTimes(data))
}

func (a timeFormatAdapter) Update(ctx context.Context, table limen.SchemaTableName, conditions []limen.Where, updates map[string]any) (limen.DatabaseResult, error) {
	return a.DatabaseAdapter.Update(ctx, table, formatConditions(conditions), formatTimes(updates))
}

func (a timeFormatAdapter) FindOne(ctx context.Context, table limen.SchemaTableName, conditions []limen.Where, orderBy []limen.OrderBy) (map[string]any, error) {
	return a.DatabaseAdapter.FindOne(ctx, table, formatConditions(conditions), orderBy)
}

func (a timeFormatAdapter) FindMany(ctx context.Context, table limen.SchemaTableName, conditions []limen.Where, options *limen.QueryOptions) ([]map[string]any, error) {
	return a.DatabaseAdapter.FindMany(ctx, table, formatConditions(conditions), options)
}

func (a timeFormatAdapter) Delete(ctx context.Context, table limen.SchemaTableName, conditions []limen.Where) (limen.DatabaseResult, error) {
	return a.DatabaseAdapter.Delete(ctx, table, formatConditions(conditions))
}

func (a timeFormatAdapter) Exists(ctx context.Context, table limen.SchemaTableName, conditions []limen.Where) (bool, error) {
	return a.DatabaseAdapter.Exists(ctx, table, formatConditions(conditions))
}

func (a timeFormatAdapter) Count(ctx context.Context, table limen.SchemaTableName, conditions []limen.Where) (int64, error) {
	return a.DatabaseAdapter.Count(ctx, table, formatConditions(conditions))
}

func formatTimes(data map[string]any) map[string]any {
	out := make(map[string]any, len(data))
	for k, v := range data {
		out[k] = formatValue(v)
	}
	return out
}

func formatConditions(conditions []limen.Where) []limen.Where {
	out := make([]limen.Where, len(conditions))
	for i, c := range conditions {
		c.Value = formatValue(c.Value)
		out[i] = c
	}
	return out
}

func formatValue(v any) any {
	switch t := v.(type) {
	case time.Time:
		return t.UTC().Format(time.RFC3339Nano)
	case *time.Time:
		if t == nil {
			return nil
		}
		return t.UTC().Format(time.RFC3339Nano)
	case []any:
		out := make([]any, len(t))
		for i, e := range t {
			out[i] = formatValue(e)
		}
		return out
	default:
		return v
	}
}
