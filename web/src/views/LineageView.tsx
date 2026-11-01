import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import type { LineageResponse, LineageNode } from '../lib/types';
import { PersonSearchSelect } from '../components/ui/PersonSearchSelect';
import { formatLifespan } from '../lib/utils';
import { useToast } from '../components/ui/Toast';
import { useI18n } from '../lib/i18nContext';

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
  const [direction, setDirection] = useState<'ancestors' | 'descendants'>('ancestors');
  const [depth, setDepth] = useState(5);
  const [data, setData] = useState<LineageResponse | null>(null);
  const [loading, setLoading] = useState(false);

  // If no rootId given, fetch people to pick the first one
  useEffect(() => {
    if (!rootId) {
      api.listIndividuals(treeId, { limit: 1 }).then((res) => {
        if (res.individuals.length > 0) {
          setRootId(res.individuals[0].id);
        }
      }).catch(() => {});
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

  // Group nodes by depth
  const nodesByDepth = new Map<number, LineageNode[]>();
  data?.nodes.forEach((node) => {
    const list = nodesByDepth.get(node.depth) || [];
    list.push(node);
    nodesByDepth.set(node.depth, list);
  });

  const sortedDepths = Array.from(nodesByDepth.keys()).toSorted((a, b) => a - b);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Header & Controls */}
      <div className="bg-white rounded-2xl border border-stone-200/80 p-6 shadow-xs space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-stone-900 tracking-tight flex items-center gap-2">
              {t('lineage.title')}
            </h1>
            <p className="text-xs text-stone-500 mt-0.5">
              {t('lineage.description')}
            </p>
          </div>

          {/* Direction toggle */}
          <div className="flex rounded-xl border border-stone-200 bg-stone-100 p-1 text-xs font-semibold self-start md:self-auto">
            <button
              onClick={() => setDirection('ancestors')}
              className={`px-4 py-1.5 rounded-lg transition-colors cursor-pointer ${
                direction === 'ancestors'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              {t('workspace.ancestors')}
            </button>
            <button
              onClick={() => setDirection('descendants')}
              className={`px-4 py-1.5 rounded-lg transition-colors cursor-pointer ${
                direction === 'descendants'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              {t('workspace.descendants')}
            </button>
          </div>
        </div>

        {/* Root Selector & Depth Slider */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-stone-100 items-end">
          <div className="md:col-span-2">
            <PersonSearchSelect
              treeId={treeId}
              label={t('lineage.root')}
              value={rootId}
              onSelect={(p) => p && setRootId(p.id)}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold text-stone-700">
              <span className="uppercase tracking-wider">{t('canvas.depth')}</span>
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
      <div className="bg-white rounded-2xl border border-stone-200/80 p-6 sm:p-8 shadow-xs min-h-[500px] overflow-x-auto">
        {loading ? (
          <div className="py-24 text-center">
            <div className="w-8 h-8 border-2 border-stone-300 border-t-amber-700 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-stone-500">{t('common.loading')}</p>
          </div>
        ) : !data || data.nodes.length === 0 ? (
          <div className="py-24 text-center space-y-2">
            <div className="text-base font-semibold text-stone-800">{t('lineage.empty')}</div>
            <p className="text-xs text-stone-500">{t('lineage.emptyDescription')}</p>
          </div>
        ) : (
          <div className="space-y-6">
            {data.truncated && (
              <div className="p-3 bg-amber-50 border border-amber-200/80 rounded-xl text-xs text-amber-900 flex items-center gap-2">
                <span className="font-semibold">Notice:</span> {t('lineage.truncated')}
              </div>
            )}

            {/* Generational Column Cards */}
            <div className="flex items-start gap-8 min-w-max pb-4">
              {sortedDepths.map((lvl) => {
                const nodes = nodesByDepth.get(lvl) || [];
                const tierLabel =
                  lvl === 0
                    ? t('lineage.root')
                    : direction === 'ancestors'
                    ? lvl === 1
                      ? t('workspace.parents')
                      : `${t('workspace.ancestors')} +${lvl}`
                    : lvl === 1
                    ? t('workspace.children')
                    : `${t('workspace.descendants')} -${lvl}`;

                return (
                  <div key={lvl} className="w-64 flex flex-col space-y-3 shrink-0">
                    {/* Header for this generational tier */}
                    <div className="sticky top-0 bg-white/95 backdrop-blur-xs py-2 border-b border-stone-200 z-10 flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-stone-800">
                        {tierLabel}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-600 font-mono font-medium">
                        {nodes.length}
                      </span>
                    </div>

                    {/* Nodes in this tier */}
                    <div className="space-y-3">
                      {nodes.map((node, idx) => {
                        const isRoot = node.id === rootId && lvl === 0;
                        const isFemale = node.gender === 'FEMALE';

                        return (
                          <div
                            key={`${node.id}-${idx}`}
                            className={`p-4 rounded-xl border transition-all duration-150 group ${
                              isRoot
                                ? 'bg-stone-900 text-white border-stone-900 shadow-md ring-2 ring-amber-500/50'
                                : 'bg-stone-50/70 hover:bg-white border-stone-200 shadow-2xs hover:shadow-md'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                                  isRoot
                                    ? 'bg-amber-400 text-stone-900'
                                    : isFemale
                                    ? 'bg-rose-50 text-rose-700 border border-rose-100'
                                    : 'bg-stone-100 text-stone-700 border border-stone-200'
                                }`}
                              >
                                {isFemale ? t('person.female') : t('person.male')}
                              </span>

                              <button
                                onClick={() => onNavigatePerson(node.id)}
                                className={`text-xs hover:underline cursor-pointer font-medium ${
                                  isRoot ? 'text-amber-300' : 'text-stone-500 hover:text-stone-900'
                                }`}
                              >
                                View
                              </button>
                            </div>

                            <div
                              onClick={() => onNavigatePerson(node.id)}
                              className="mt-2 cursor-pointer"
                            >
                              <div
                                className={`font-bold text-base tracking-tight truncate ${
                                  isRoot ? 'text-white' : 'text-stone-900 group-hover:text-amber-900'
                                }`}
                              >
                                {node.full_native}
                              </div>
                              <div
                                className={`text-xs truncate ${
                                  isRoot ? 'text-stone-300' : 'text-stone-500'
                                }`}
                              >
                                {node.full_latin}
                              </div>
                            </div>

                            <div
                              className={`text-[11px] mt-2 pt-2 border-t font-mono ${
                                isRoot ? 'border-stone-800 text-stone-400' : 'border-stone-100 text-stone-400'
                              }`}
                            >
                              {formatLifespan(node.birth_year_ec, node.death_year_ec, node.is_deceased, t('calendar.eraEC'))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
