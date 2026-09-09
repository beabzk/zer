import { useEffect, useState } from "react";
import { ApiError, api, type LineageNode, type PersonHit } from "../../lib/api";
import { t, type Locale } from "../../lib/i18n";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  Select,
  Skeleton,
} from "../ui";

interface Props {
  locale: Locale;
  treeId: string;
  rootId: string;
  refreshKey: number;
  onSelect: (id: string) => void;
}

export interface LineageGroup {
  depth: number;
  ids: string[];
}

export function groupByDepth(nodes: Array<Pick<LineageNode, "id" | "depth">>): LineageGroup[] {
  const byDepth = new Map<number, string[]>();
  for (const node of nodes) {
    const list = byDepth.get(node.depth) ?? [];
    list.push(node.id);
    byDepth.set(node.depth, list);
  }
  return [...byDepth.entries()]
    .toSorted(([a], [b]) => a - b)
    .map(([depth, ids]) => ({ depth, ids }));
}

// Display cap keeps name resolution bounded on wide descendant trees.
const maxRendered = 80;

export function LineageWorkspace({ locale, treeId, rootId, refreshKey, onSelect }: Props) {
  const [direction, setDirection] = useState<"ancestors" | "descendants">("ancestors");
  const [depth, setDepth] = useState(4);
  const [groups, setGroups] = useState<LineageGroup[]>([]);
  const [names, setNames] = useState<Record<string, PersonHit>>({});
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadKey, setLoadKey] = useState(0);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    api.analysis.lineage(treeId, rootId, direction, depth)
      .then(async (res) => {
        if (!live) return;
        const sliced = res.nodes.slice(0, maxRendered);
        setTruncated(res.nodes.length > sliced.length);
        setGroups(groupByDepth(sliced));
        const resolved: Record<string, PersonHit> = {};
        await Promise.all(
          sliced.map(async (node) => {
            try {
              const full = await api.individuals.get(treeId, node.id);
              if (live) {
                resolved[node.id] = {
                  id: full.id,
                  full_native: full.full_native,
                  full_latin: full.full_latin,
                  gender: full.gender,
                };
              }
            } catch {
              // Missing nodes stay unlabeled; the id still renders.
            }
          }),
        );
        if (live) setNames(resolved);
      })
      .catch((e) => {
        if (live) setError(e instanceof ApiError ? e.message : t(locale, "common.error"));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [locale, treeId, rootId, direction, depth, refreshKey, loadKey]);

  const renderCard = (id: string, root: boolean) => {
    const named = names[id];
    return (
      <button
        key={id}
        onClick={() => named && onSelect(id)}
        disabled={!named}
        className={`w-full min-w-44 rounded-lg border bg-panel px-4 py-3 text-left shadow-panel transition-colors hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-70 ${root ? "border-accent" : "border-border"}`}
      >
        <span className="block truncate text-sm font-semibold">{named ? named.full_latin : id}</span>
        {named && <span className="mt-1 block truncate text-xs text-muted-foreground">{named.full_native}</span>}
        {root && (
          <span className="mt-2 block text-[11px] font-semibold uppercase tracking-[0.1em] text-accent-strong">
            {t(locale, "lineage.root")}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-strong">{t(locale, "views.pedigree")}</p>
          <h1 className="mt-2 font-display text-4xl font-semibold">{t(locale, "lineage.title")}</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{t(locale, "lineage.description")}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:w-auto">
          <Select value={direction} onChange={(e) => setDirection(e.target.value as "ancestors" | "descendants")} aria-label={t(locale, "workspace.direction")}>
            <option value="ancestors">{t(locale, "workspace.ancestors")}</option>
            <option value="descendants">{t(locale, "workspace.descendants")}</option>
          </Select>
          <Select value={String(depth)} onChange={(e) => setDepth(Number(e.target.value))} aria-label={t(locale, "canvas.depth")}>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{t(locale, "canvas.depth")} {n}</option>)}
          </Select>
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>
            {direction === "ancestors" ? t(locale, "workspace.ancestors") : t(locale, "workspace.descendants")}
          </CardTitle>
          <CardDescription>
            {truncated ? t(locale, "lineage.truncated") : t(locale, "lineage.description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div role="alert" className="mb-4 flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
              <p>{error}</p>
              <Button size="sm" variant="outline" onClick={() => setLoadKey((key) => key + 1)}>
                {t(locale, "common.retry")}
              </Button>
            </div>
          )}
          {loading ? (
            <div className="flex flex-col gap-2 md:flex-row">
              {[1, 2, 3].map((row) => <Skeleton key={row} className="h-20 w-full md:w-44" />)}
            </div>
          ) : groups.length === 0 ? (
            <Empty title={t(locale, "lineage.empty")} description={t(locale, "lineage.emptyDescription")} />
          ) : (
            <>
              {/* Vertical timeline on small screens, generation columns above. */}
              <ol className="flex flex-col gap-4 md:hidden">
                {groups.flatMap((group) =>
                  group.ids.map((id) => (
                    <li key={id} className="relative pl-6">
                      <span className="absolute left-2 top-0 bottom-0 w-px bg-border" aria-hidden="true" />
                      <span className="absolute left-0 top-5 h-4 w-4 rounded-full bg-accent" aria-hidden="true" />
                      {renderCard(id, group.depth === 0)}
                    </li>
                  )),
                )}
              </ol>
              <div className="hidden gap-6 overflow-x-auto pb-2 md:flex">
                {groups.map((group) => (
                  <div key={group.depth} className="flex min-w-44 flex-col gap-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                      {group.depth === 0 ? t(locale, "lineage.root") : `${t(locale, "lineage.generation")} ${group.depth}`}
                    </p>
                    {group.ids.map((id) => renderCard(id, group.depth === 0))}
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
