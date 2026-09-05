import { useState } from "react";
import { ApiError, api, type Individual } from "../../lib/api";
import { t, type Locale } from "../../lib/i18n";
import { EthioDatePicker, type EthioDate } from "./EthioDatePicker";

interface Props {
  locale: Locale;
  treeId: string;
  initial?: Individual;
  onClose: () => void;
  onSaved: (person: Individual) => void;
}

function toEthioDate(y?: number, m?: number, d?: number): EthioDate {
  return { year: y, month: m, day: d };
}

export function IndividualModal({ locale, treeId, initial, onClose, onSaved }: Props) {
  const [nativeName, setNativeName] = useState(initial?.given_name_native ?? "");
  const [latinName, setLatinName] = useState(initial?.given_name_latin ?? "");
  const [gender, setGender] = useState(initial?.gender ?? "MALE");
  const [titles, setTitles] = useState(() => {
    try {
      const raw = initial?.titles ? JSON.parse(initial.titles) : [];
      return Array.isArray(raw) ? raw.join(", ") : "";
    } catch {
      return "";
    }
  });
  const [birth, setBirth] = useState<EthioDate>(
    toEthioDate(initial?.birth_year_ec, initial?.birth_month_ec, initial?.birth_day_ec),
  );
  const [birthPlace, setBirthPlace] = useState(initial?.birth_place ?? "");
  const [deceased, setDeceased] = useState((initial?.is_deceased ?? 0) === 1);
  const [death, setDeath] = useState<EthioDate>(
    toEthioDate(initial?.death_year_ec, initial?.death_month_ec, initial?.death_day_ec),
  );
  const [clearBirth, setClearBirth] = useState(false);
  const [clearDeath, setClearDeath] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const storedBirth =
    initial?.birth_year_ec != null ||
    initial?.birth_month_ec != null ||
    initial?.birth_day_ec != null ||
    initial?.birth_date_gc != null;
  const storedDeath =
    initial?.death_year_ec != null ||
    initial?.death_month_ec != null ||
    initial?.death_day_ec != null ||
    initial?.death_date_gc != null;

  const editBirth = (date: EthioDate) => {
    setBirth(date);
    if (date.year != null || date.month != null || date.day != null) setClearBirth(false);
  };
  const editDeath = (date: EthioDate) => {
    setDeath(date);
    if (date.year != null || date.month != null || date.day != null) setClearDeath(false);
  };

  const submit = async () => {
    setError("");
    setSaving(true);
    try {
      const titleList = titles
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const body: Record<string, unknown> = {
        given_name_native: nativeName.trim(),
        given_name_latin: latinName.trim(),
        gender,
        titles: titleList,
        birth_year_ec: birth.year,
        birth_month_ec: birth.month,
        birth_day_ec: birth.day,
        birth_place: birthPlace.trim() || undefined,
        is_deceased: deceased,
        clear_birth_date: clearBirth || undefined,
      };
      if (deceased) {
        body.death_year_ec = death.year;
        body.death_month_ec = death.month;
        body.death_day_ec = death.day;
        body.clear_death_date = clearDeath || undefined;
      }
      const saved = initial
        ? await api.individuals.update(treeId, initial.id, body)
        : await api.individuals.create(treeId, body);
      onSaved(saved);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t(locale, "common.error"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!initial || !window.confirm(t(locale, "person.confirmDelete"))) return;
    await api.individuals.remove(treeId, initial.id);
    onClose();
  };

  const input = "w-full px-3 py-2 border rounded text-sm";
  const label = "block text-xs font-medium text-gray-600 mb-1";

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-5 w-full max-w-lg max-h-[90vh] overflow-auto">
        <h2 className="text-lg font-semibold mb-4">
          {initial ? t(locale, "person.edit") : t(locale, "person.add")}
        </h2>
        {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 sm:col-span-1">
            <label className={label}>{t(locale, "person.nativeName")}</label>
            <input className={input} value={nativeName} onChange={(e) => setNativeName(e.target.value)} />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className={label}>{t(locale, "person.latinName")}</label>
            <input className={input} value={latinName} onChange={(e) => setLatinName(e.target.value)} />
          </div>
          <div>
            <label className={label}>{t(locale, "person.gender")}</label>
            <select className={input} value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="MALE">{t(locale, "person.male")}</option>
              <option value="FEMALE">{t(locale, "person.female")}</option>
            </select>
          </div>
          <div>
            <label className={label}>{t(locale, "person.titles")}</label>
            <input className={input} value={titles} onChange={(e) => setTitles(e.target.value)} />
          </div>
          <div className="col-span-2">
            <div className="flex items-center justify-between mb-1">
              <label className={label}>{t(locale, "person.birth")}</label>
              {storedBirth && !clearBirth && (
                <button
                  type="button"
                  onClick={() => {
                    setBirth({});
                    setClearBirth(true);
                  }}
                  className="text-xs text-red-600 hover:underline"
                >
                  {t(locale, "person.clearDate")}
                </button>
              )}
            </div>
            {clearBirth ? (
              <p className="text-xs text-gray-500">{t(locale, "person.cleared")}</p>
            ) : (
              <>
                <EthioDatePicker locale={locale} value={birth} onChange={editBirth} />
                <PartialHint locale={locale} date={birth} />
              </>
            )}
          </div>
          <div className="col-span-2">
            <label className={label}>{t(locale, "person.place")}</label>
            <input className={input} value={birthPlace} onChange={(e) => setBirthPlace(e.target.value)} />
          </div>
          <div className="col-span-2 flex items-center gap-2">
            <input
              type="checkbox"
              id="deceased"
              checked={deceased}
              onChange={(e) => setDeceased(e.target.checked)}
            />
            <label htmlFor="deceased" className="text-sm">{t(locale, "person.deceased")}</label>
          </div>
          {deceased && (
            <div className="col-span-2">
              <div className="flex items-center justify-between mb-1">
                <label className={label}>{t(locale, "person.death")}</label>
                {storedDeath && !clearDeath && (
                  <button
                    type="button"
                    onClick={() => {
                      setDeath({});
                      setClearDeath(true);
                    }}
                    className="text-xs text-red-600 hover:underline"
                  >
                    {t(locale, "person.clearDate")}
                  </button>
                )}
              </div>
              {clearDeath ? (
                <p className="text-xs text-gray-500">{t(locale, "person.cleared")}</p>
              ) : (
                <>
                  <EthioDatePicker locale={locale} value={death} onChange={editDeath} />
                  <PartialHint locale={locale} date={death} />
                </>
              )}
            </div>
          )}
        </div>
        <div className="flex justify-between mt-5">
          <div>
            {initial && (
              <button onClick={remove} className="px-4 py-2 text-sm text-red-600 hover:underline">
                {t(locale, "person.delete")}
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm border rounded">
              {t(locale, "person.cancel")}
            </button>
            <button
              onClick={submit}
              disabled={saving}
              className="px-4 py-2 text-sm bg-black text-white rounded disabled:opacity-50"
            >
              {t(locale, "person.save")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PartialHint({ locale, date }: { locale: Locale; date: EthioDate }) {
  const filled = [date.year, date.month, date.day].filter((v) => v != null).length;
  if (filled === 0 || filled === 3) return null;
  return <p className="text-xs text-gray-500 mt-1">{t(locale, "person.partialHint")}</p>;
}
