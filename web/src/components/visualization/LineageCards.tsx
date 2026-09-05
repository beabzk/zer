import { useEffect, useState } from "react";
import { ApiError, api } from "../../lib/api";
import { t, type Locale } from "../../lib/i18n";

interface Props {
  locale: Locale;
  treeId: string;
  rootId: string;
  refreshKey: number;
  onSelect: (id: string) => void;
}

interface CardRow {
  id: string;
  depth: number;
  full_native: string;
  full_latin: string;
}

/** Vertical ancestor chain for small screens. */
export function LineageCards({ locale, treeId, rootId, refreshKey, onSelect }: Props) {
  const [rows, setRows] = useState<CardRow[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    setError("");
    api.analysis
      .lineage(treeId, rootId, "ancestors", 30)
      .then(async (res) => {
        const cards: CardRow[] = [];
        for (const n of res.nodes) {
          const full = await api.individuals.get(treeId, n.id);
          cards.push({
            id: n.id,
            depth: n.depth,
            full_native: full.full_native,
            full_latin: full.full_latin,
          });
        }
        cards.sort((a, b) => a.depth - b.depth);
        if (live) setRows(cards);
      })
      .catch((e) => {
        if (live) setError(e instanceof ApiError ? e.message : t(locale, "common.error"));
      });
    return () => {
      live = false;
    };
  }, [treeId, rootId, refreshKey, locale]);

  if (error) return <p className="text-red-600 text-sm p-4">{error}</p>;
  if (rows.length === 0) return <p className="text-sm text-gray-500 p-4">{t(locale, "common.loading")}</p>;

  return (
    <ol className="p-4 space-y-0 max-w-md mx-auto">
      {rows.map((row, i) => (
        <li key={row.id} className="relative pl-6 pb-4">
          {i < rows.length - 1 && (
            <span className="absolute left-2 top-8 bottom-0 w-px bg-gray-300" aria-hidden />
          )}
          <span className="absolute left-0 top-5 h-4 w-4 rounded-full bg-black" aria-hidden />
          <button
            onClick={() => onSelect(row.id)}
            className="w-full text-left bg-white border rounded-lg px-4 py-3 shadow-sm hover:shadow"
          >
            <span className="block font-medium">{row.full_latin}</span>
            <span className="block text-sm text-gray-600">{row.full_native}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}
