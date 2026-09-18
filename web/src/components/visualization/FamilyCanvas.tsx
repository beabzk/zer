import { useEffect, useMemo, useRef, useState } from "react";
import { select } from "d3-selection";
import { zoom, type ZoomTransform } from "d3-zoom";
import { ApiError, api, type FlowEdge, type FlowNode } from "../../lib/api";
import { t, tf, type Locale } from "../../lib/i18n";
import { formatLifeYears } from "../../lib/personSummary";
import { CARD_H, CARD_W, GAP_X, GAP_Y, layoutGraph } from "./layout";
import { pathData, relatedTo, routeGraph } from "./routing";
import { Button, CardContent, Empty, Skeleton } from "../ui";

interface Props {
  locale: Locale;
  treeId: string;
  focusId: string;
  depth: number;
  showParents: boolean;
  showUnions: boolean;
  selectedId: string;
  onSelect: (id: string) => void;
  refreshKey: number;
  retryKey: number;
  fitKey: number;
  onRetry: () => void;
}

interface ViewTransform {
  x: number;
  y: number;
  k: number;
}

interface RelationSentence {
  id: string;
  text: string;
}

function displayName(node?: FlowNode): string {
  return node?.data.full_latin || node?.data.full_native || "";
}

/** Pan/zoom family graph. Nodes are HTML cards, edges are SVG paths.
  Controls and states live in the workspace; the canvas stays calm. */
export function FamilyCanvas({
  locale,
  treeId,
  focusId,
  depth,
  showParents,
  showUnions,
  selectedId,
  onSelect,
  refreshKey,
  retryKey,
  fitKey,
  onRetry,
}: Props) {
  const outerRef = useRef<HTMLDivElement>(null);
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [edges, setEdges] = useState<FlowEdge[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState<ViewTransform>({ x: 0, y: 0, k: 1 });
  const [fittedKey, setFittedKey] = useState("");
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setLoaded(false);
    setError("");
    api.analysis
      .subgraph(treeId, focusId, depth)
      .then((res) => {
        if (!live) return;
        setNodes(res.nodes);
        setEdges(res.edges);
        setLoaded(true);
        setFittedKey("");
      })
      .catch((e) => {
        if (live) {
          setError(e instanceof ApiError ? e.message : t(locale, "common.error"));
          setLoaded(true);
        }
      });
    return () => {
      live = false;
    };
  }, [treeId, focusId, depth, refreshKey, retryKey, locale]);

  // A hovered or focused person may leave the subgraph on refetch.
  useEffect(() => {
    setHoverId(null);
    setFocusNodeId(null);
  }, [nodes]);

  const visibleEdges = useMemo(
    () => edges.filter((e) => (e.label === "parent" && showParents) || (e.label === "union" && showUnions)),
    [edges, showParents, showUnions],
  );

  const placed = useMemo(() => {
    const parentEdges = visibleEdges
      .filter((e) => e.label === "parent")
      .map((e) => ({ source: e.source, target: e.target }));
    const unionEdges = visibleEdges
      .filter((e) => e.label === "union")
      .map((e) => ({ source: e.source, target: e.target }));
    return layoutGraph(
      nodes.map((n) => ({ id: n.id })),
      parentEdges,
      unionEdges,
    );
  }, [nodes, visibleEdges]);

  const routed = useMemo(
    () =>
      routeGraph(
        placed,
        visibleEdges
          .filter((e) => e.label === "parent")
          .map((e) => ({ id: e.id, source: e.source, target: e.target })),
        visibleEdges
          .filter((e) => e.label === "union")
          .map((e) => ({ id: e.id, source: e.source, target: e.target })),
      ),
    [placed, visibleEdges],
  );

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const activeId = hoverId ?? focusNodeId ?? (selectedId || null);
  const dimming = Boolean(activeId);
  const highlight = useMemo(() => relatedTo(visibleEdges, activeId), [visibleEdges, activeId]);

  const sortedRouted = useMemo(() => {
    return routed.toSorted((a, b) => {
      const aRel = highlight.edgeIds.has(a.id) ? 1 : 0;
      const bRel = highlight.edgeIds.has(b.id) ? 1 : 0;
      return aRel - bRel;
    });
  }, [routed, highlight.edgeIds]);

  const relations = useMemo<RelationSentence[]>(() => {
    if (!activeId) return [];
    return visibleEdges
      .filter((e) => e.source === activeId || e.target === activeId)
      .map((e) => ({
        id: e.id,
        text: tf(locale, e.label === "union" ? "graph.relationPartner" : "graph.relationParent", {
          from: displayName(nodeById.get(e.source)),
          to: displayName(nodeById.get(e.target)),
        }),
      }));
  }, [activeId, locale, nodeById, visibleEdges]);

  const bounds = useMemo(() => {
    if (placed.length === 0) return { w: 0, h: 0 };
    const maxX = Math.max(...placed.map((p) => p.x));
    const maxY = Math.max(...placed.map((p) => p.y));
    return { w: maxX + CARD_W + GAP_X, h: maxY + CARD_H + GAP_Y };
  }, [placed]);

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const behavior = zoom<HTMLDivElement, unknown>()
      .scaleExtent([0.2, 2.5])
      .on("zoom", (event) => {
        const tr = event.transform as ZoomTransform;
        setView({ x: tr.x, y: tr.y, k: tr.k });
      });
    select(el).call(behavior);
    return () => {
      select(el).on(".zoom", null);
    };
  }, []);

  const fit = () => {
    const el = outerRef.current;
    if (!el || bounds.w === 0) return;
    const k = Math.min(el.clientWidth / bounds.w, el.clientHeight / bounds.h, 1.25);
    setView({
      k,
      x: (el.clientWidth - bounds.w * k) / 2,
      y: 24,
    });
    setFittedKey(`${treeId}:${focusId}:${depth}:${refreshKey}:${retryKey}:${fitKey}`);
  };

  useEffect(() => {
    if (fitKey > 0) fit();
    // Parent-driven refit only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  useEffect(() => {
    if (fittedKey !== `${treeId}:${focusId}:${depth}:${refreshKey}:${retryKey}:${fitKey}` && bounds.w > 0) {
      fit();
    }
    // Fit once per dataset; user pans freely afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bounds, fittedKey]);

  if (error) {
    return (
      <CardContent className="flex flex-col items-start gap-3 p-6">
        <p role="alert" className="text-sm text-destructive">{error}</p>
        <Button size="sm" variant="outline" onClick={onRetry}>{t(locale, "common.retry")}</Button>
      </CardContent>
    );
  }

  if (!loaded) {
    return (
      <div className="flex h-[65vh] flex-col gap-2 p-4" aria-label={t(locale, "common.loading")}>
        <Skeleton className="h-16 w-56" />
        <Skeleton className="h-full w-full" />
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <CardContent className="p-6">
        <Empty title={t(locale, "graph.empty")} description={t(locale, "graph.emptyDescription")} />
      </CardContent>
    );
  }

  return (
    <div
      ref={outerRef}
      role="region"
      aria-label={t(locale, "views.canvas")}
      className="relative h-[65vh] cursor-grab overflow-hidden bg-panel"
    >
      <div
        className="absolute origin-top-left"
        style={{
          width: bounds.w,
          height: bounds.h,
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`,
        }}
      >
        <svg
          className="absolute top-0 left-0 pointer-events-none"
          width={bounds.w}
          height={bounds.h}
          aria-hidden="true"
        >
          {sortedRouted.map((connection) => {
            const d = pathData(connection.segments);
            if (!d) return null;
            const related = highlight.edgeIds.has(connection.id);
            const dimmed = dimming && !related;
            const union = connection.kind === "union";
            const stroke = related ? "var(--accent-strong)" : union ? "var(--accent-strong)" : "var(--border)";
            return (
              <g key={connection.id} className={dimmed ? "opacity-30" : undefined}>
                <path
                  d={d}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={related ? (union ? 3 : 2.5) : union ? 2 : 1.5}
                  strokeDasharray={union ? "5 3" : undefined}
                  strokeLinecap="round"
                />
                {connection.anchors.map((anchor) => (
                  <circle
                    key={`${anchor.x}:${anchor.y}`}
                    cx={anchor.x}
                    cy={anchor.y}
                    r={related ? 2.5 : 2}
                    fill={stroke}
                  />
                ))}
              </g>
            );
          })}
        </svg>
        {placed.map((p) => {
          const node = nodeById.get(p.id);
          if (!node) return null;
          const selected = p.id === selectedId;
          const related = highlight.nodeIds.has(p.id);
          const dimmed = dimming && !related;
          return (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              onMouseEnter={() => setHoverId(p.id)}
              onMouseLeave={() => setHoverId((current) => (current === p.id ? null : current))}
              onFocus={() => setFocusNodeId(p.id)}
              onBlur={() => setFocusNodeId((current) => (current === p.id ? null : current))}
              aria-pressed={selected}
              className={`absolute overflow-hidden rounded-md border bg-panel px-2 py-1 text-left shadow-panel transition-all hover:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                dimmed ? "opacity-40 " : ""
              }${selected ? "border-2 border-accent" : related ? "border-accent/80 ring-1 ring-accent/30 font-medium" : "border-border"}`}
              style={{ left: p.x, top: p.y, width: CARD_W, height: CARD_H }}
            >
              <span className="block truncate text-sm font-medium">{node.data.full_latin}</span>
              <span className="block truncate text-sm font-medium">{node.data.full_native}</span>
              <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                {[
                  formatLifeYears(node.data),
                  node.data.is_deceased ? t(locale, "person.deceased") : t(locale, "person.living"),
                ].filter(Boolean).join(" · ")}
              </span>
            </button>
          );
        })}
      </div>
      <div className="sr-only" role="status" aria-live="polite">
        {activeId ? (
          relations.length > 0 ? (
            <>
              <p>{t(locale, "graph.relationsHeading")}</p>
              <ul>
                {relations.map((relation) => (
                  <li key={relation.id}>{relation.text}</li>
                ))}
              </ul>
            </>
          ) : (
            <p>{t(locale, "graph.relationsEmpty")}</p>
          )
        ) : null}
      </div>
    </div>
  );
}
