import { useEffect, useState } from "react";
import { ApiError, api, type Tree, type TreeStats } from "../../lib/api";
import { t, type Locale } from "../../lib/i18n";

interface Props {
  locale: Locale;
  activeId: string;
  onSelect: (id: string) => void;
  refreshKey: number;
  isAdmin: boolean;
}

export function TreeSwitcher({ locale, activeId, onSelect, refreshKey, isAdmin }: Props) {
  const [trees, setTrees] = useState<Tree[]>([]);
  const [stats, setStats] = useState<Record<string, TreeStats>>({});
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  const load = () => {
    const listTrees = isAdmin
      ? api.admin.trees().then((all) =>
          all.map((tr) => ({
            id: tr.id,
            name: tr.name,
            slug: tr.slug,
            default_lang: tr.default_lang,
          })),
        )
      : api.trees.list();
    listTrees
      .then(async (list) => {
        setTrees(list);
        const entries = await Promise.all(
          list.map(async (tr) => {
            try {
              const s = await api.trees.stats(tr.id);
              return [tr.id, s] as const;
            } catch {
              return null;
            }
          }),
        );
        const next: Record<string, TreeStats> = {};
        for (const e of entries) {
          if (e) next[e[0]] = e[1];
        }
        setStats(next);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : t(locale, "common.error")));
  };

  useEffect(load, [refreshKey, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  const create = async () => {
    if (!name.trim()) return;
    setError("");
    try {
      const tree = await api.trees.create({ name: name.trim() });
      setName("");
      setCreating(false);
      load();
      onSelect(tree.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t(locale, "common.error"));
    }
  };

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold">{t(locale, "trees.title")}</h2>
        <button
          onClick={() => setCreating(!creating)}
          className="text-xs border rounded px-2 py-1"
        >
          {t(locale, "trees.create")}
        </button>
      </div>
      {creating && (
        <div className="flex gap-1 mb-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t(locale, "trees.name")}
            className="flex-1 min-w-0 px-2 py-1 border rounded text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") void create();
            }}
          />
          <button onClick={() => void create()} className="text-xs bg-black text-white rounded px-2">
            OK
          </button>
        </div>
      )}
      {error && <p className="text-red-600 text-xs mb-2">{error}</p>}
      {trees.length === 0 ? (
        <p className="text-xs text-gray-500">{t(locale, "trees.empty")}</p>
      ) : (
        <ul className="space-y-1">
          {trees.map((tr) => (
            <li key={tr.id}>
              <button
                onClick={() => onSelect(tr.id)}
                className={`w-full text-left px-2 py-2 rounded text-sm ${
                  tr.id === activeId ? "bg-black text-white" : "hover:bg-gray-100"
                }`}
              >
                <span className="block font-medium truncate">{tr.name}</span>
                {stats[tr.id] && (
                  <span
                    className={`block text-xs ${tr.id === activeId ? "text-gray-300" : "text-gray-500"}`}
                  >
                    {stats[tr.id].individuals} {t(locale, "trees.individuals")} ·{" "}
                    {stats[tr.id].members} {t(locale, "trees.members")}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
