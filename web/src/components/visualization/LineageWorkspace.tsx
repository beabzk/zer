import { useEffect, useMemo, useState } from "react";
import { ApiError, api, type LineageNode, type LineageResult } from "../../lib/api";
import { t, type Locale } from "../../lib/i18n";
import { formatLifeYears } from "../../lib/personSummary";
import { CARD_W } from "./layout";
import { layoutPedigree, pathKey, type PedigreeCard } from "./pedigree";
import { pathData } from "./routing";
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

const depthChoices = [1, 2, 3, 4, 5, 6, 7, 8];

/** Pedigree branches for one direction. The server returns person summaries
  with each occurrence, so the branch diagram needs no per-node lookups. */
export function LineageWorkspace({ locale, treeId, rootId, refreshKey, onSelect }: Props) {
  const [direction, setDirection] = useState<"ancestors" | "descendants">("ancestors");
  const [depth, setDepth] = useState(4);
  const [result, setResult] = useState<LineageResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadKey, setLoadKey] = useState(0);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    api.analysis.lineage(treeId, rootId, direction, depth)
      .then((res) => {
        if (live) setResult(res);
      })
      .catch((e) => {
        if (live) {
          setResult(null);
          setError(e instanceof ApiError ? e.message : t(locale, "common.error"));
        }
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [locale, treeId, rootId, direction, depth, refreshKey, loadKey]);

  const layout = useMemo(
    () => layoutPedigree(result?.nodes ?? [], result?.unions ?? [], direction),
    [result, direction],
  );
  // The timeline keeps the focus person first on small screens.
  const timeline = useMemo(
    () => layout.cards.toSorted((a, b) => a.depth - b.depth || a.x - b.x),
    [layout],
  );
  const nodeByKey = useMemo(() => {
    const map = new Map<string, LineageNode>();
    for (const node of result?.nodes ?? []) map.set(pathKey(node.path), node);
    return map;
  }, [result]);

  const renderCard = (card: PedigreeCard) => {
    const node = nodeByKey.get(card.key);
    if (!node) return null;
    const root = card.depth === 0;
    const years = formatLifeYears(node);
    const status = node.is_deceased ? t(locale, "person.deceased") : t(locale, "person.living");
    return (
      <button
        onClick={() => onSelect(node.id)}
        aria-label={root ? `${t(locale, "lineage.root")}: ${node.full_latin}` : undefined}
        className={`flex h-20 w-full flex-col justify-center overflow-hidden rounded-lg border bg-panel px-3 py-2 text-left shadow-panel transition-colors hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${root ? "border-accent" : "border-border"}`}
      >
        <span className="block truncate text-sm font-semibold">{node.full_latin}</span>
        <span className="block truncate text-sm font-medium">{node.full_native}</span>
        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
          {[years, status].filter(Boolean).join(" · ")}
        </span>
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
            {depthChoices.map((n) => <option key={n} value={n}>{t(locale, "canvas.depth")} {n}</option>)}
          </Select>
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>
            {direction === "ancestors" ? t(locale, "workspace.ancestors") : t(locale, "workspace.descendants")}
          </CardTitle>
          {result?.truncated && <CardDescription>{t(locale, "lineage.truncated")}</CardDescription>}
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
          ) : layout.cards.length === 0 ? (
            <Empty title={t(locale, "lineage.empty")} description={t(locale, "lineage.emptyDescription")} />
          ) : (
            <>
              {/* Small screens keep a readable timeline; the branch diagram
                  needs horizontal space and appears from md upward. */}
              <ol data-testid="pedigree-timeline" className="flex flex-col gap-3 md:hidden">
                {timeline.map((card) => (
                  <li key={card.key} className="relative pl-6" style={{ marginLeft: `${Math.min(card.depth, 6) * 10}px` }}>
                    <span className="absolute left-2 top-0 bottom-0 w-px bg-border" aria-hidden="true" />
                    <span className="absolute left-0 top-8 h-4 w-4 rounded-full bg-accent" aria-hidden="true" />
                    {renderCard(card)}
                  </li>
                ))}
              </ol>
              <div data-testid="pedigree-branches" className="hidden overflow-x-auto pb-2 md:block">
                <div className="relative" style={{ width: layout.width, height: layout.height }}>
                  <svg
                    className="pointer-events-none absolute top-0 left-0"
                    width={layout.width}
                    height={layout.height}
                    aria-hidden="true"
                  >
                    {layout.branches.map((link) => (
                      <path
                        key={link.key}
                        d={pathData(link.segments)}
                        fill="none"
                        stroke="var(--border)"
                        strokeWidth={1.5}
                        strokeLinecap="round"
                      />
                    ))}
                    {layout.partners.map((link) => (
                      <path
                        key={link.key}
                        d={pathData(link.segments)}
                        fill="none"
                        stroke="var(--accent-strong)"
                        strokeWidth={2}
                        strokeDasharray="5 3"
                        strokeLinecap="round"
                      />
                    ))}
                  </svg>
                  {layout.cards.map((card) => (
                    <div key={card.key} className="absolute" style={{ left: card.x, top: card.y, width: CARD_W }}>
                      {renderCard(card)}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
