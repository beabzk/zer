import { useEffect, useState } from "react";
import { ApiError, api, type Tree, type TreeStats } from "../../lib/api";
import { t, type Locale } from "../../lib/i18n";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, useToast } from "../ui";

interface Props {
  locale: Locale;
  activeId: string;
  onSelect: (id: string) => void;
  refreshKey: number;
  isAdmin: boolean;
  onTreesLoaded?: (trees: Tree[]) => void;
}

export function TreeSwitcher({ locale, activeId, onSelect, refreshKey, isAdmin, onTreesLoaded }: Props) {
  const [trees, setTrees] = useState<Tree[]>([]);
  const [stats, setStats] = useState<Record<string, TreeStats>>({});
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const toast = useToast();

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
        onTreesLoaded?.(list);
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
      toast.push({ title: t(locale, "trees.created"), description: tree.name, variant: "success" });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t(locale, "common.error"));
    }
  };

  return (
    <div className="flex flex-col gap-5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{t(locale, "trees.title")}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{t(locale, "trees.switchHint")}</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setCreating(!creating)}
        >
          {t(locale, "trees.create")}
        </Button>
      </div>
      {creating && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t(locale, "trees.create")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t(locale, "trees.name")}
            aria-label={t(locale, "trees.name")}
            onKeyDown={(e) => {
              if (e.key === "Enter") void create();
            }}
          />
          <Button onClick={() => void create()} size="sm">
            OK
          </Button>
          </CardContent>
        </Card>
      )}
      {error && <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
      {trees.length === 0 ? (
        <p className="text-sm leading-6 text-muted-foreground">{t(locale, "trees.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {trees.map((tr) => (
            <li key={tr.id}>
              <button
                onClick={() => onSelect(tr.id)}
                className={`group w-full rounded-md border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  tr.id === activeId
                    ? "border-foreground bg-foreground text-background shadow-panel"
                    : "border-transparent hover:border-border hover:bg-panel-muted"
                }`}
              >
                <span className="block truncate text-sm font-semibold">{tr.name}</span>
                {stats[tr.id] && (
                  <span className={`mt-2 flex items-center gap-2 text-xs ${tr.id === activeId ? "text-background/70" : "text-muted-foreground"}`}>
                    <Badge className={tr.id === activeId ? "bg-background/15 text-background" : ""}>
                      {stats[tr.id].individuals} {t(locale, "trees.individuals")}
                    </Badge>
                    <span>{stats[tr.id].members} {t(locale, "trees.members")}</span>
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
