import { useEffect, useMemo, useRef, useState } from "react";
import { select } from "d3-selection";
import { zoom, type ZoomTransform } from "d3-zoom";
import { ApiError, api, type FlowEdge, type FlowNode } from "../../lib/api";
import { t, type Locale } from "../../lib/i18n";
import { CARD_H, CARD_W, GAP_X, GAP_Y, layoutGraph } from "./layout";

interface Props {
  locale: Locale;
  treeId: string;
  focusId: string;
  depth: number;
  onDepthChange: (depth: number) => void;
  selectedId: string;
  onSelect: (id: string) => void;
  refreshKey: number;
}

interface ViewTransform {
  x: number;
  y: number;
  k: number;
}

/** Pan/zoom family graph. Nodes are HTML cards, edges are SVG paths. */
export function FamilyCanvas({
  locale,
  treeId,
  focusId,
  depth,
  onDepthChange,
  selectedId,
  onSelect,
  refreshKey,
}: Props) {
  const outerRef = useRef<HTMLDivElement>(null);
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [edges, setEdges] = useState<FlowEdge[]>([]);
  const [error, setError] = useState("");
  const [view, setView] = useState<ViewTransform>({ x: 0, y: 0, k: 1 });
  const [fittedKey, setFittedKey] = useState("");

  useEffect(() => {
    let live = true;
    setError("");
    api.analysis
      .subgraph(treeId, focusId, depth)
      .then((res) => {
        if (!live) return;
        setNodes(res.nodes);
        setEdges(res.edges);
        setFittedKey("");
      })
      .catch((e) => {
        if (live) setError(e instanceof ApiError ? e.message : t(locale, "common.error"));
      });
    return () => {
      live = false;
    };
  }, [treeId, focusId, depth, refreshKey, locale]);

  const placed = useMemo(() => {
    const parentEdges = edges
      .filter((e) => e.label === "parent")
      .map((e) => ({ source: e.source, target: e.target }));
    const unionEdges = edges
      .filter((e) => e.label === "union")
      .map((e) => ({ source: e.source, target: e.target }));
    return layoutGraph(
      nodes.map((n) => ({ id: n.id })),
      parentEdges,
      unionEdges,
    );
  }, [nodes, edges]);

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
    setFittedKey(`${treeId}:${focusId}:${depth}:${refreshKey}`);
  };

  useEffect(() => {
    if (fittedKey !== `${treeId}:${focusId}:${depth}:${refreshKey}` && bounds.w > 0) {
      fit();
    }
    // Fit once per dataset; user pans freely afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bounds, fittedKey]);

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const edgePath = (edge: FlowEdge): string | null => {
    const s = placed.find((p) => p.id === edge.source);
    const tgt = placed.find((p) => p.id === edge.target);
    if (!s || !tgt) return null;
    if (edge.label === "union") {
      const y1 = s.y + CARD_H / 2;
      const y2 = tgt.y + CARD_H / 2;
      const x1 = s.x < tgt.x ? s.x + CARD_W : s.x;
      const x2 = s.x < tgt.x ? tgt.x : tgt.x + CARD_W;
      return `M ${x1} ${y1} L ${x2} ${y2}`;
    }
    const x1 = s.x + CARD_W / 2;
    const y1 = s.y + CARD_H;
    const x2 = tgt.x + CARD_W / 2;
    const y2 = tgt.y;
    const midY = (y1 + y2) / 2;
    return `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
  };

  if (error) return <p className="text-red-600 text-sm p-4">{error}</p>;

  return (
    <div>
      <div className="flex items-center gap-3 px-4 py-2">
        <label className="text-xs text-gray-600">
          {t(locale, "canvas.depth")}:{" "}
          <select
            value={depth}
            onChange={(e) => onDepthChange(parseInt(e.target.value, 10))}
            className="border rounded text-sm px-2 py-1"
          >
            {[2, 3, 4, 6].map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <button onClick={fit} className="text-xs border rounded px-3 py-1">
          {t(locale, "canvas.fit")}
        </button>
      </div>
      <div ref={outerRef} className="relative overflow-hidden bg-gray-50 h-[65vh] cursor-grab">
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
          >
            {edges.map((e) => {
              const d = edgePath(e);
              if (!d) return null;
              return (
                <path
                  key={e.id}
                  d={d}
                  fill="none"
                  stroke={e.label === "union" ? "#111" : "#9ca3af"}
                  strokeWidth={e.label === "union" ? 2 : 1.5}
                  strokeDasharray={e.label === "union" ? "5 3" : undefined}
                />
              );
            })}
          </svg>
          {placed.map((p) => {
            const node = nodeById.get(p.id);
            if (!node) return null;
            const selected = p.id === selectedId;
            return (
              <button
                key={p.id}
                onClick={() => onSelect(p.id)}
                className={`absolute bg-white border rounded-lg px-2 py-1 text-left shadow-sm hover:shadow overflow-hidden ${
                  selected ? "border-black border-2" : ""
                }`}
                style={{ left: p.x, top: p.y, width: CARD_W, height: CARD_H }}
              >
                <span className="block text-xs font-medium truncate">{node.data.full_latin}</span>
                <span className="block text-xs text-gray-600 truncate">{node.data.full_native}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
