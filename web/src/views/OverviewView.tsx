import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import type { TreeOverviewResponse, PersonSummary } from '../lib/types';
import { Icons } from '../components/ui/Icons';
import { formatLifespan } from '../lib/utils';
import { useToast } from '../components/ui/Toast';
import { useI18n } from '../lib/i18nContext';

interface OverviewViewProps {
  treeId: string;
  onNavigatePerson: (personId: string) => void;
  onNavigateTab: (tab: string) => void;
  onOpenAddPerson: () => void;
  onOpenAddRelationship: () => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  treeId,
  onNavigatePerson,
  onNavigateTab,
  onOpenAddPerson,
  onOpenAddRelationship,
}) => {
  const toast = useToast();
  const { t } = useI18n();
  const [data, setData] = useState<TreeOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = () => {
    setLoading(true);
    api
      .getTreeOverview(treeId)
      .then(setData)
      .catch((err) => toast.error(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, [treeId]);

  if (loading && !data) {
    return (
      <div className="py-20 text-center">
        <div className="w-8 h-8 border-2 border-stone-300 border-t-amber-700 rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-stone-500">{t('common.loading')}</p>
      </div>
    );
  }

  if (!data) return null;

  const { tree, counts, recent_individuals, recent_events } = data;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl border border-stone-200/80 p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-800 bg-amber-50 px-2.5 py-1 rounded-md">
              <Icons.Tree size={14} /> {t('trees.title')}
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-stone-950 tracking-tight">{tree.name}</h1>
            {tree.description && <p className="text-sm text-stone-600 max-w-2xl">{tree.description}</p>}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={onOpenAddPerson}
              className="px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-sm font-medium transition-colors shadow-xs flex items-center gap-2 cursor-pointer"
            >
              <Icons.Plus size={16} /> {t('person.add')}
            </button>
            <button
              onClick={onOpenAddRelationship}
              className="px-4 py-2 bg-white hover:bg-stone-50 text-stone-800 border border-stone-200 rounded-xl text-sm font-medium transition-colors shadow-xs flex items-center gap-2 cursor-pointer"
            >
              <Icons.Link size={16} /> {t('edge.editRelationship')}
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-6 mt-6 border-t border-stone-100">
          <div className="p-4 rounded-xl bg-stone-50 border border-stone-100">
            <div className="text-xs text-stone-500 font-medium capitalize">{t('trees.individuals')}</div>
            <div className="text-2xl font-bold text-stone-900 mt-1">{counts.individuals}</div>
          </div>
          <div className="p-4 rounded-xl bg-stone-50 border border-stone-100">
            <div className="text-xs text-stone-500 font-medium capitalize">{t('trees.edges')}</div>
            <div className="text-2xl font-bold text-stone-900 mt-1">{counts.edges}</div>
          </div>
          <div className="p-4 rounded-xl bg-stone-50 border border-stone-100">
            <div className="text-xs text-stone-500 font-medium capitalize">{t('trees.unions')}</div>
            <div className="text-2xl font-bold text-stone-900 mt-1">{counts.unions}</div>
          </div>
          <div className="p-4 rounded-xl bg-stone-50 border border-stone-100">
            <div className="text-xs text-stone-500 font-medium capitalize">{t('dashboard.events')}</div>
            <div className="text-2xl font-bold text-stone-900 mt-1">{counts.events}</div>
          </div>
          <div className="p-4 rounded-xl bg-stone-50 border border-stone-100">
            <div className="text-xs text-stone-500 font-medium capitalize">{t('trees.members')}</div>
            <div className="text-2xl font-bold text-stone-900 mt-1">{counts.members}</div>
          </div>
        </div>
      </div>

      {/* Two columns: Recent People & Recent Events */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Individuals */}
        <div className="bg-white rounded-2xl border border-stone-200/80 p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <Icons.Users size={18} className="text-amber-800" />
                <h2 className="text-base font-semibold text-stone-900">{t('dashboard.recentPeople')}</h2>
              </div>
              <button
                onClick={() => onNavigateTab('people')}
                className="text-xs font-medium text-amber-800 hover:text-amber-950 flex items-center gap-1 cursor-pointer transition-colors"
              >
                {t('people.all')} ({counts.individuals}) <Icons.ArrowRight size={13} />
              </button>
            </div>

            <div className="divide-y divide-stone-100 mt-2">
              {recent_individuals.length === 0 ? (
                <div className="py-8 text-center text-sm text-stone-400">
                  {t('dashboard.emptyPeople')}
                </div>
              ) : (
                recent_individuals.map((p: PersonSummary) => (
                  <div
                    key={p.id}
                    onClick={() => onNavigatePerson(p.id)}
                    className="py-3 px-2 flex items-center justify-between hover:bg-amber-50/50 rounded-xl transition-colors cursor-pointer group"
                  >
                    <div className="min-w-0 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-stone-900 text-sm group-hover:text-amber-950 truncate">
                          {p.full_native}
                        </span>
                        <span className="text-xs text-stone-500 truncate">({p.full_latin})</span>
                      </div>
                      <div className="text-xs text-stone-400 mt-0.5">
                        {formatLifespan(p.birth_year_ec, p.death_year_ec, p.is_deceased, t('calendar.eraEC'))}
                      </div>
                    </div>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${
                        p.gender === 'FEMALE' ? 'bg-rose-50 text-rose-700' : 'bg-stone-100 text-stone-700'
                      }`}
                    >
                      {p.gender === 'FEMALE' ? t('person.female') : t('person.male')}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-stone-100 mt-4">
            <button
              onClick={() => onNavigateTab('graph')}
              className="w-full py-2.5 px-4 bg-stone-50 hover:bg-stone-100 text-stone-800 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Icons.Network size={15} /> {t('dashboard.openGraph')}
            </button>
          </div>
        </div>

        {/* Recent Events Timeline */}
        <div className="bg-white rounded-2xl border border-stone-200/80 p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <Icons.Calendar size={18} className="text-amber-800" />
                <h2 className="text-base font-semibold text-stone-900">{t('dashboard.latestEvents')}</h2>
              </div>
              <span className="text-xs text-stone-400 font-mono">{counts.events} total</span>
            </div>

            <div className="divide-y divide-stone-100 mt-2">
              {recent_events.length === 0 ? (
                <div className="py-8 text-center text-sm text-stone-400">
                  {t('dashboard.noEvents')}
                </div>
              ) : (
                recent_events.map((ev) => (
                  <div
                    key={ev.id}
                    onClick={() => onNavigatePerson(ev.individual_id)}
                    className="py-3 px-2 flex items-start justify-between hover:bg-amber-50/50 rounded-xl transition-colors cursor-pointer group"
                  >
                    <div className="min-w-0 pr-3">
                      <div className="text-sm font-semibold text-stone-900 group-hover:text-amber-950">
                        {ev.event_type}
                      </div>
                      <div className="text-xs text-stone-600 mt-0.5 truncate">
                        {ev.full_native} ({ev.full_latin})
                      </div>
                      {ev.event_place && (
                        <div className="text-[11px] text-stone-400 mt-0.5">{ev.event_place}</div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xs font-medium text-amber-800 bg-amber-50 px-2 py-0.5 rounded">
                        {ev.event_year_ec ? `${ev.event_year_ec} ${t('calendar.eraEC')}` : ev.event_date_gc || 'Dated'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-stone-100 mt-4">
            <button
              onClick={() => onNavigateTab('kinship')}
              className="w-full py-2.5 px-4 bg-stone-50 hover:bg-stone-100 text-stone-800 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Icons.Kinship size={15} /> {t('kinship.title')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
