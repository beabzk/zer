import { useState } from "react";
import { ApiError, api, type KinshipResult, type PersonHit } from "../../lib/api";
import { t, type Locale } from "../../lib/i18n";
import { SearchSelect } from "../forms/SearchSelect";

interface Props {
  locale: Locale;
  treeId: string;
}

export function KinshipFinder({ locale, treeId }: Props) {
  const [a, setA] = useState<PersonHit | null>(null);
  const [b, setB] = useState<PersonHit | null>(null);
  const [result, setResult] = useState<KinshipResult | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const find = async () => {
    if (!a || !b) return;
    setError("");
    setBusy(true);
    try {
      const res = await api.analysis.kinship(treeId, a.id, b.id);
      setResult(res);
      const ids = new Set<string>();
      for (const s of res.segments) {
        ids.add(s.from_id);
        ids.add(s.to_id);
      }
      const entries = await Promise.all(
        [...ids].map(async (id) => {
          const p = await api.individuals.get(treeId, id);
          return [id, p.full_latin] as const;
        }),
      );
      setNames(Object.fromEntries(entries));
    } catch (e) {
      setResult(null);
      setError(e instanceof ApiError ? e.message : t(locale, "kinship.none"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 max-w-lg mx-auto space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          {t(locale, "kinship.personA")}
        </label>
        <SearchSelect locale={locale} treeId={treeId} value={a} onChange={setA} />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          {t(locale, "kinship.personB")}
        </label>
        <SearchSelect locale={locale} treeId={treeId} value={b} onChange={setB} />
      </div>
      <button
        onClick={() => void find()}
        disabled={busy || !a || !b}
        className="px-4 py-2 text-sm bg-black text-white rounded disabled:opacity-50"
      >
        {t(locale, "kinship.find")}
      </button>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      {result && (
        <div className="bg-white border rounded-lg p-4 text-sm">
          <p className="font-medium mb-2">
            {result.path_key} · {result.degrees_of_sep} {t(locale, "kinship.degrees")}
          </p>
          <ol className="space-y-1">
            {result.segments.map((s, i) => (
              <li key={i} className="text-gray-700">
                {names[s.from_id] ?? s.from_id} → {names[s.to_id] ?? s.to_id} ({s.relation})
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
