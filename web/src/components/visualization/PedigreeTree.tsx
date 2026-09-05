import { useEffect, useState } from "react";
import { ApiError, api, type Individual } from "../../lib/api";
import { t, type Locale } from "../../lib/i18n";

interface Props {
  locale: Locale;
  treeId: string;
  rootId: string;
  refreshKey: number;
  onSelect: (id: string) => void;
}

/** Ancestor pedigree grouped by generation. */
export function PedigreeTree({ locale, treeId, rootId, refreshKey, onSelect }: Props) {
  const [generations, setGenerations] = useState<Individual[][]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    setError("");
    api.analysis
      .lineage(treeId, rootId, "ancestors", 10)
      .then(async (res) => {
        const maxDepth = Math.max(0, ...res.nodes.map((n) => n.depth));
        const groups: Individual[][] = Array.from({ length: maxDepth + 1 }, () => []);
        for (const n of res.nodes) {
          const full = await api.individuals.get(treeId, n.id);
          groups[n.depth].push(full);
        }
        if (live) setGenerations(groups);
      })
      .catch((e) => {
        if (live) setError(e instanceof ApiError ? e.message : t(locale, "common.error"));
      });
    return () => {
      live = false;
    };
  }, [treeId, rootId, refreshKey, locale]);

  if (error) return <p className="text-red-600 text-sm p-4">{error}</p>;
  if (generations.length === 0)
    return <p className="text-sm text-gray-500 p-4">{t(locale, "common.loading")}</p>;

  return (
    <div className="p-4 overflow-auto">
      <div className="flex gap-6 min-w-max">
        {generations.map((gen, depth) => (
          <div key={depth} className="flex flex-col gap-3 justify-center">
            {gen.map((person) => (
              <button
                key={person.id}
                onClick={() => onSelect(person.id)}
                className="bg-white border rounded-lg px-4 py-2 shadow-sm text-left hover:shadow w-44"
              >
                <span className="block text-sm font-medium truncate">{person.full_latin}</span>
                <span className="block text-xs text-gray-600 truncate">{person.full_native}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
