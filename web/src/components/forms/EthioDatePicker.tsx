import { months, t, type Locale } from "../../lib/i18n";

export interface EthioDate {
  year?: number;
  month?: number;
  day?: number;
}

interface Props {
  locale: Locale;
  value: EthioDate;
  onChange: (date: EthioDate) => void;
}

/** Day cap for a month. Pagume has 6 days, leap validation stays server-side. */
export function maxDay(month?: number): number {
  return month === 13 ? 6 : 30;
}

export function EthioDatePicker({ locale, value, onChange }: Props) {
  const labels = months(locale);
  return (
    <div className="grid grid-cols-3 gap-2">
      <input
        type="number"
        aria-label={t(locale, "common.year")}
        placeholder={t(locale, "common.year")}
        value={value.year ?? ""}
        onChange={(e) =>
          onChange({
            ...value,
            year: e.target.value === "" ? undefined : parseInt(e.target.value, 10),
          })
        }
        className="px-3 py-2 border rounded text-sm"
      />
      <select
        aria-label={t(locale, "common.month")}
        value={value.month ?? 1}
        onChange={(e) => onChange({ ...value, month: parseInt(e.target.value, 10) })}
        className="px-3 py-2 border rounded text-sm"
      >
        {labels.map((label, i) => (
          <option key={i + 1} value={i + 1}>
            {label}
          </option>
        ))}
      </select>
      <input
        type="number"
        aria-label={t(locale, "common.day")}
        placeholder={t(locale, "common.day")}
        min={1}
        max={maxDay(value.month)}
        value={value.day ?? ""}
        onChange={(e) =>
          onChange({
            ...value,
            day: e.target.value === "" ? undefined : parseInt(e.target.value, 10),
          })
        }
        className="px-3 py-2 border rounded text-sm"
      />
    </div>
  );
}
