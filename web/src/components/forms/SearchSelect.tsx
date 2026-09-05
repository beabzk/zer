import { useEffect, useState } from "react";
import { api, type PersonHit } from "../../lib/api";
import { t, type Locale } from "../../lib/i18n";

interface Props {
  locale: Locale;
  treeId: string;
  excludeId?: string;
  value: PersonHit | null;
  onChange: (person: PersonHit | null) => void;
}

export function SearchSelect({ locale, treeId, excludeId, value, onChange }: Props) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PersonHit[]>([]);

  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      api.individuals
        .list(treeId, query || undefined)
        .then((all) => {
          if (live) setHits(all.filter((p) => p.id !== excludeId).slice(0, 8));
        })
        .catch(() => {
          if (live) setHits([]);
        });
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query, treeId, excludeId]);

  return (
    <div>
      {value ? (
        <div className="flex items-center justify-between px-3 py-2 border rounded text-sm">
          <span>
            {value.full_latin} · {value.full_native}
          </span>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-gray-500 hover:text-black"
            aria-label={t(locale, "common.close")}
          >
            ×
          </button>
        </div>
      ) : (
        <>
          <input
            type="text"
            placeholder={t(locale, "person.search")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full px-3 py-2 border rounded text-sm"
          />
          {query && (
            <ul className="mt-1 border rounded text-sm max-h-40 overflow-auto bg-white">
              {hits.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-gray-100"
                    onClick={() => {
                      onChange(p);
                      setQuery("");
                    }}
                  >
                    {p.full_latin} · {p.full_native}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
