import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { select } from "d3-selection";
import { zoom, zoomIdentity, type ZoomBehavior } from "d3-zoom";
import { api } from "../lib/api";
import type { SubgraphResponse } from "../lib/types";
import { Icons } from "../components/ui/Icons";
import { PersonSearchSelect } from "../components/ui/PersonSearchSelect";
import { useToast } from "../components/ui/Toast";
import { useI18n } from "../lib/i18nContext";
import {
  buildFamilyTreeLayout,
  type FamilyTreeLayoutResult,
} from "../components/visualization/familyTreeLayout";
import { CanvasPersonCard } from "../components/visualization/CanvasPersonCard";
import { CanvasInspectorCard } from "../components/visualization/CanvasInspectorCard";

interface GraphViewProps {
  treeId: string;
  initialRootId?: string;
  onNavigatePerson: (personId: string) => void;
}

export const GraphView: React.FC<GraphViewProps> = ({
  treeId,
  initialRootId,
  onNavigatePerson,
}) => {
  const toast = useToast();
  const { t } = useI18n();
  const [rootId, setRootId] = useState<string | undefined>(initialRootId);
  const [depth, setDepth] = useState<number>(3);
  const [data, setData] = useState<SubgraphResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<SVGGElement>(null);
  const zoomBehaviorRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  // If no rootId provided, fetch first person from directory
  useEffect(() => {
    if (!rootId) {
      api
        .listIndividuals(treeId, { limit: 1 })
        .then((res) => {
          if (res.individuals.length > 0) {
            setRootId(res.individuals[0].id);
          }
        })
        .catch(() => {});
    }
  }, [treeId, rootId]);

  // Load subgraph when rootId or depth changes
  useEffect(() => {
    if (!rootId) return;
    setLoading(true);
    api
      .getSubgraph(treeId, rootId, depth)
      .then((res) => {
        setData(res);
        if (!selectedNodeId || !res.nodes.some((n) => n.id === selectedNodeId)) {
          setSelectedNodeId(rootId);
        }
      })
      .catch((err) => toast.error(err.message))
      .finally(() => setLoading(false));
  }, [treeId, rootId, depth]);

  // Build deterministic hierarchical pedigree layout
  const layout: FamilyTreeLayoutResult = useMemo(() => {
    if (!data || !rootId) {
      return {
        cards: [],
        unions: [],
        connectors: [],
        bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0 },
      };
    }
    return buildFamilyTreeLayout(rootId, data.nodes, data.edges);
  }, [data, rootId]);

  // Dynamic legend items based on what is actively rendered
  const usedLegendItems = useMemo(() => {
    const items = new Set<string>();
    layout.connectors.forEach((c) => {
      if (c.type === "union_bridge") {
        if (c.unionStatus === "DISSOLVED") items.add("union_dissolved");
        else if (c.unionStatus === "WIDOWED") items.add("union_widowed");
        else items.add("union_active");
      } else {
        if (c.relationshipType === "ADOPTIVE") items.add("rel_adoptive");
        else if (c.relationshipType === "FOSTER") items.add("rel_foster");
        else items.add("rel_biological");
      }
    });
    return items;
  }, [layout]);

  // Fast node lookup for inspector drawer
  const selectedNode = useMemo(() => {
    if (!data || !selectedNodeId) return null;
    return data.nodes.find((n) => n.id === selectedNodeId) || null;
  }, [data, selectedNodeId]);

  // Initialize D3 Zoom
  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    const svg = select(svgRef.current);
    const container = select(containerRef.current);

    const zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 2.5])
      .on("zoom", (event) => {
        container.attr("transform", event.transform.toString());
      });

    svg.call(zoomBehavior);
    zoomBehaviorRef.current = zoomBehavior;
  }, []);

  // Fit layout to view viewport
  const handleFitView = useCallback(() => {
    if (!svgRef.current || !zoomBehaviorRef.current || layout.cards.length === 0) return;
    const svgRect = svgRef.current.getBoundingClientRect();
    if (svgRect.width === 0 || svgRect.height === 0) return;

    const { minX, maxX, minY, maxY, width, height } = layout.bounds;
    const padding = 70;
    const availableW = svgRect.width - padding * 2;
    const availableH = svgRect.height - padding * 2;

    const scaleX = availableW / Math.max(width, 100);
    const scaleY = availableH / Math.max(height, 100);
    const fitScale = Math.min(Math.max(Math.min(scaleX, scaleY), 0.25), 1.05);

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    const tx = svgRect.width / 2 - centerX * fitScale;
    const ty = svgRect.height / 2 - centerY * fitScale;

    select(svgRef.current).call(
      zoomBehaviorRef.current.transform,
      zoomIdentity.translate(tx, ty).scale(fitScale),
    );
  }, [layout]);

  // Center specifically on focal root card
  const handleCenterRoot = useCallback(() => {
    if (!svgRef.current || !zoomBehaviorRef.current || layout.cards.length === 0) return;
    const rootCard = layout.cards.find((c) => c.isRoot) || layout.cards[0];
    if (!rootCard) return;

    const svgRect = svgRef.current.getBoundingClientRect();
    const cardCenterX = rootCard.x + rootCard.width / 2;
    const cardCenterY = rootCard.y + rootCard.height / 2;

    const scale = 1.0;
    const tx = svgRect.width / 2 - cardCenterX * scale;
    const ty = svgRect.height / 2 - cardCenterY * scale;

    select(svgRef.current).call(
      zoomBehaviorRef.current.transform,
      zoomIdentity.translate(tx, ty).scale(scale),
    );
  }, [layout]);

  // Auto-fit when layout updates
  useEffect(() => {
    if (layout.cards.length > 0) {
      handleFitView();
    }
  }, [layout, handleFitView]);

  const handleZoom = (factor: number) => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    select(svgRef.current).call(zoomBehaviorRef.current.scaleBy, factor);
  };

  const handleResetZoom = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    select(svgRef.current).call(zoomBehaviorRef.current.transform, zoomIdentity);
  };

  return (
    <div
      className="relative flex-1 w-full flex flex-col bg-stone-50/60 overflow-hidden select-none"
      style={{
        backgroundImage: "radial-gradient(#e2e8f0 1.25px, transparent 1.25px)",
        backgroundSize: "24px 24px",
      }}
    >
      {/* Top Floating Control Bar */}
      <div className="absolute top-4 left-4 right-4 z-20 flex flex-wrap items-center justify-between gap-3 pointer-events-none">
        {/* Left: Person Selector & Depth */}
        <div className="flex items-center gap-2 bg-white/95 backdrop-blur-md p-1.5 rounded-xl border border-stone-200/90 shadow-sm pointer-events-auto">
          <div className="w-56 sm:w-72">
            <PersonSearchSelect
              treeId={treeId}
              value={rootId}
              placeholder="Focus on individual..."
              onSelect={(p) => {
                if (p) {
                  setRootId(p.id);
                  setSelectedNodeId(p.id);
                }
              }}
            />
          </div>

          <div className="flex items-center gap-1.5 pl-2 border-l border-stone-200 text-xs">
            <span className="text-stone-500 font-medium hidden sm:inline">Depth:</span>
            <select
              value={depth}
              onChange={(e) => setDepth(parseInt(e.target.value, 10))}
              className="px-2 py-1 bg-stone-50 border border-stone-200 rounded-lg text-stone-800 font-semibold focus:outline-none cursor-pointer"
            >
              <option value="1">1 {t("lineage.generation")}</option>
              <option value="2">2 {t("lineage.generation")}</option>
              <option value="3">3 {t("lineage.generation")}</option>
              <option value="4">4 {t("lineage.generation")}</option>
              <option value="5">5 {t("lineage.generation")}</option>
            </select>
          </div>
        </div>

        {/* Right: Legend & Navigation Controls */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {/* Dynamic Legend */}
          <div className="hidden lg:flex items-center gap-4 bg-white/95 backdrop-blur-md px-3.5 py-2 rounded-xl border border-stone-200/90 shadow-sm text-xs text-stone-600 flex-wrap">
            {usedLegendItems.has("rel_biological") && (
              <div className="flex items-center gap-2">
                <span className="w-5 h-0.5 bg-stone-700 rounded-full" />
                <span>{t("edge.biological")}</span>
              </div>
            )}
            {usedLegendItems.has("rel_adoptive") && (
              <div className="flex items-center gap-2">
                <span className="w-5 h-0.5 border-t-2 border-dashed border-teal-600" />
                <span className="text-teal-700 font-medium">{t("edge.adoptive")}</span>
              </div>
            )}
            {usedLegendItems.has("rel_foster") && (
              <div className="flex items-center gap-2">
                <span className="w-5 h-0.5 border-t-2 border-dotted border-purple-600" />
                <span className="text-purple-700 font-medium">{t("edge.foster")}</span>
              </div>
            )}
            {usedLegendItems.has("union_active") && (
              <div className="flex items-center gap-2">
                <span className="w-5 h-0.5 border-t-2 border-dashed border-amber-600" />
                <span>{t("edge.active")}</span>
              </div>
            )}
            {usedLegendItems.has("union_dissolved") && (
              <div className="flex items-center gap-2">
                <span className="w-5 h-0.5 border-t-2 border-dashed border-slate-400" />
                <span className="text-slate-500">{t("edge.dissolved")}</span>
              </div>
            )}
            {usedLegendItems.has("union_widowed") && (
              <div className="flex items-center gap-2">
                <span className="w-5 h-0.5 border-t-2 border-dashed border-rose-600" />
                <span className="text-rose-700">{t("edge.widowed")}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-amber-200" />
              <span>{t("canvas.focus")}</span>
            </div>
          </div>

          {/* Canvas Controls */}
          <div className="flex items-center gap-1 bg-white/95 backdrop-blur-md p-1 rounded-xl border border-stone-200/90 shadow-sm">
            <button
              onClick={() => handleZoom(1.25)}
              className="p-2 hover:bg-stone-100 rounded-lg text-stone-700 transition-colors cursor-pointer"
              title="Zoom In"
            >
              <Icons.ZoomIn size={16} />
            </button>
            <button
              onClick={() => handleZoom(0.8)}
              className="p-2 hover:bg-stone-100 rounded-lg text-stone-700 transition-colors cursor-pointer"
              title="Zoom Out"
            >
              <Icons.ZoomOut size={16} />
            </button>
            <button
              onClick={handleFitView}
              className="p-2 hover:bg-stone-100 rounded-lg text-stone-700 transition-colors cursor-pointer"
              title={t("canvas.fit")}
            >
              <Icons.Layers size={16} />
            </button>
            <button
              onClick={handleCenterRoot}
              className="p-2 hover:bg-stone-100 rounded-lg text-stone-700 transition-colors cursor-pointer"
              title={t("canvas.focus")}
            >
              <Icons.Crosshair size={16} />
            </button>
            <button
              onClick={handleResetZoom}
              className="p-2 hover:bg-stone-100 rounded-lg text-stone-700 transition-colors cursor-pointer"
              title={t("canvas.reset")}
            >
              <Icons.Reset size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Main SVG Family Tree Canvas */}
      <div className="flex-1 w-full h-full relative cursor-grab active:cursor-grabbing">
        {loading && (
          <div className="absolute inset-0 bg-white/40 backdrop-blur-2xs flex items-center justify-center z-10 pointer-events-none">
            <div className="w-8 h-8 border-2 border-stone-300 border-t-amber-700 rounded-full animate-spin" />
          </div>
        )}

        <svg ref={svgRef} className="w-full h-full">
          <defs>
            <filter id="cardShadow" x="-10%" y="-10%" width="120%" height="125%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.06" />
            </filter>
            <filter id="focusGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow
                dx="0"
                dy="0"
                stdDeviation="4"
                floodColor="#d97706"
                floodOpacity="0.25"
              />
            </filter>
          </defs>

          <g ref={containerRef}>
            {/* 1. Connectors (Orthogonal lines) */}
            <g className="connectors-layer">
              {layout.connectors.map((connector) => {
                const isUnion = connector.type === "union_bridge";

                if (isUnion) {
                  const isDissolved = connector.unionStatus === "DISSOLVED";
                  const isWidowed = connector.unionStatus === "WIDOWED";
                  const stroke = isDissolved ? "#94a3b8" : isWidowed ? "#be123c" : "#d97706";
                  const strokeDasharray = isDissolved ? "9 4 2 4" : isWidowed ? "6 3 2 3" : "5 4";
                  const strokeWidth = isDissolved ? "2" : "2.5";

                  return (
                    <path
                      key={connector.id}
                      d={connector.path}
                      stroke={stroke}
                      strokeWidth={strokeWidth}
                      strokeDasharray={strokeDasharray}
                      fill="none"
                      strokeLinecap="round"
                    />
                  );
                }

                const isAdoptive = connector.relationshipType === "ADOPTIVE";
                const isFoster = connector.relationshipType === "FOSTER";
                const stroke = isAdoptive ? "#0d9488" : isFoster ? "#7c3aed" : "#57534e";
                const strokeDasharray = isAdoptive ? "7 4" : isFoster ? "3 4" : undefined;
                const strokeWidth = isAdoptive || isFoster ? "2.5" : "2";

                return (
                  <path
                    key={connector.id}
                    d={connector.path}
                    stroke={stroke}
                    strokeWidth={strokeWidth}
                    strokeDasharray={strokeDasharray}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                );
              })}
            </g>

            {/* 2. Union Junction Tees */}
            <g className="junctions-layer">
              {layout.unions.map((u) => {
                const isDissolved = u.status === "DISSOLVED";
                const isWidowed = u.status === "WIDOWED";
                const fill = isDissolved ? "#94a3b8" : isWidowed ? "#be123c" : "#d97706";

                return (
                  <g key={`junction-group-${u.id}`}>
                    <circle
                      cx={u.junctionX}
                      cy={u.junctionY}
                      r="4.5"
                      fill={fill}
                      stroke="#ffffff"
                      strokeWidth="2"
                    />
                  </g>
                );
              })}
            </g>

            {/* 3. Person Cards */}
            <g className="cards-layer">
              {layout.cards.map((card) => (
                <CanvasPersonCard
                  key={card.id}
                  card={card}
                  isSelected={selectedNodeId === card.id}
                  era={t("calendar.eraEC")}
                  onClick={() => setSelectedNodeId(card.id)}
                  onDoubleClick={() => setRootId(card.id)}
                />
              ))}
            </g>
          </g>
        </svg>
      </div>

      {/* Slide-out Inspector Drawer for Selected Node */}
      {selectedNode && (
        <CanvasInspectorCard
          node={selectedNode}
          onClose={() => setSelectedNodeId(null)}
          onNavigatePerson={onNavigatePerson}
          onFocusPerson={(id) => setRootId(id)}
        />
      )}
    </div>
  );
};
