import React, { useState, useEffect, useMemo } from "react";
import { api } from "../lib/api";
import type { LineageResponse } from "../lib/types";
import { PersonSearchSelect } from "../components/ui/PersonSearchSelect";
import { useToast } from "../components/ui/Toast";
import { useI18n } from "../lib/i18nContext";
import { buildLineageTreeLayout } from "../components/visualization/lineageTreeLayout";
import { LineagePersonCard } from "../components/visualization/LineagePersonCard";

interface LineageViewProps {
  treeId: string;
  initialRootId?: string;
  onNavigatePerson: (personId: string) => void;
}

export const LineageView: React.FC<LineageViewProps> = ({
  treeId,
  initialRootId,
  onNavigatePerson,
}) => {
  const toast = useToast();
  const { t } = useI18n();
  const [rootId, setRootId] = useState<string | undefined>(initialRootId);
  const [direction, setDirection] = useState<"ancestors" | "descendants">("ancestors");
  const [depth, setDepth] = useState(5);
  const [data, setData] = useState<LineageResponse | null>(null);
  const [loading, setLoading] = useState(false);

  // If no rootId given, fetch people to pick the first one
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

  useEffect(() => {
    if (!rootId) return;
    setLoading(true);
    api
      .getLineage(treeId, rootId, direction, depth)
      .then(setData)
      .catch((err) => toast.error(err.message))
      .finally(() => setLoading(false));
  }, [treeId, rootId, direction, depth]);

  // Build tree layout with centered root and bifurcation branches
  const layout = useMemo(() => {
    if (!data || data.nodes.length === 0) {
      return {
        nodes: [],
        connectors: [],
        tierHeaders: [],
        width: 0,
        height: 0,
      };
    }
    return buildLineageTreeLayout(data.nodes, direction, {
      paddingY: 48, // clearance for tier header labels at top
    });
  }, [data, direction]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Header & Controls */}
      <div className="bg-white rounded-2xl border border-stone-200/80 p-6 shadow-xs space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-stone-900 tracking-tight flex items-center gap-2">
              {t("lineage.title")}
            </h1>
            <p className="text-xs text-stone-500 mt-0.5">{t("lineage.description")}</p>
          </div>

          {/* Direction toggle */}
          <div className="flex rounded-xl border border-stone-200 bg-stone-100 p-1 text-xs font-semibold self-start md:self-auto">
            <button
              onClick={() => setDirection("ancestors")}
              className={`px-4 py-1.5 rounded-lg transition-colors cursor-pointer ${
                direction === "ancestors"
                  ? "bg-white text-stone-900 shadow-xs"
                  : "text-stone-500 hover:text-stone-800"
              }`}
            >
              {t("workspace.ancestors")}
            </button>
            <button
              onClick={() => setDirection("descendants")}
              className={`px-4 py-1.5 rounded-lg transition-colors cursor-pointer ${
                direction === "descendants"
                  ? "bg-white text-stone-900 shadow-xs"
                  : "text-stone-500 hover:text-stone-800"
              }`}
            >
              {t("workspace.descendants")}
            </button>
          </div>
        </div>

        {/* Root Selector & Depth Slider */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-stone-100 items-end">
          <div className="md:col-span-2">
            <PersonSearchSelect
              treeId={treeId}
              label={t("lineage.root")}
              value={rootId}
              onSelect={(p) => p && setRootId(p.id)}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold text-stone-700">
              <span className="uppercase tracking-wider">{t("canvas.depth")}</span>
              <span className="text-amber-800 font-bold">{depth}</span>
            </div>
            <input
              type="range"
              min="1"
              max="10"
              value={depth}
              onChange={(e) => setDepth(parseInt(e.target.value, 10))}
              className="w-full accent-amber-700 cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Lineage Tree Grid / Horizontal Canvas */}
      <div className="bg-white rounded-2xl border border-stone-200/80 p-6 sm:p-8 shadow-xs min-h-[500px] overflow-auto">
        {loading ? (
          <div className="py-24 text-center">
            <div className="w-8 h-8 border-2 border-stone-300 border-t-amber-700 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-stone-500">{t("common.loading")}</p>
          </div>
        ) : !data || data.nodes.length === 0 ? (
          <div className="py-24 text-center space-y-2">
            <div className="text-base font-semibold text-stone-800">{t("lineage.empty")}</div>
            <p className="text-xs text-stone-500">{t("lineage.emptyDescription")}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {data.truncated && (
              <div className="p-3 bg-amber-50 border border-amber-200/80 rounded-xl text-xs text-amber-900 flex items-center gap-2">
                <span className="font-semibold">Notice:</span> {t("lineage.truncated")}
              </div>
            )}

            {/* Pedigree Horizontal Flow Canvas */}
            <div
              className="relative select-none pb-8"
              style={{
                minWidth: layout.width,
                minHeight: layout.height,
              }}
            >
              {/* Sticky-like Generational Column Tier Headers */}
              {layout.tierHeaders.map((header) => {
                const tierLabel =
                  header.depth === 0
                    ? t("lineage.root")
                    : direction === "ancestors"
                      ? header.depth === 1
                        ? t("workspace.parents")
                        : `${t("workspace.ancestors")} +${header.depth}`
                      : header.depth === 1
                        ? t("workspace.children")
                        : `${t("workspace.descendants")} -${header.depth}`;

                return (
                  <div
                    key={`header-${header.depth}`}
                    className="absolute top-0 flex items-center justify-between pb-1.5 border-b border-stone-200 text-xs font-bold uppercase tracking-wider text-stone-700"
                    style={{
                      left: header.x,
                      width: header.width,
                    }}
                  >
                    <span>{tierLabel}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-stone-100 text-stone-600 font-mono font-medium">
                      {header.count}
                    </span>
                  </div>
                );
              })}

              {/* SVG Connector Lines Layer */}
              <svg
                className="absolute inset-0 pointer-events-none"
                width={layout.width}
                height={layout.height}
              >
                {layout.connectors.map((c) => (
                  <path
                    key={c.id}
                    d={c.path}
                    stroke="#cbd5e1"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                ))}
              </svg>

              {/* Interactive Node Cards Layer */}
              {layout.nodes.map((layoutNode) => (
                <div
                  key={layoutNode.key}
                  className="absolute"
                  style={{
                    left: layoutNode.x,
                    top: layoutNode.y,
                    width: layoutNode.width,
                    height: layoutNode.height,
                  }}
                >
                  <LineagePersonCard
                    node={layoutNode.node}
                    isRoot={layoutNode.isRoot}
                    era={t("calendar.eraEC")}
                    onClick={() => onNavigatePerson(layoutNode.node.id)}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
