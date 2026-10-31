import React, { useState } from 'react';
import { api } from '../lib/api';
import type { KinshipResult } from '../lib/types';
import { Icons } from '../components/ui/Icons';
import { PersonSearchSelect } from '../components/ui/PersonSearchSelect';
import { useToast } from '../components/ui/Toast';
import { useI18n } from '../lib/i18nContext';
import { kinshipTermLabel, kinshipConfidenceLabel } from '../lib/kinshipTerms';

interface KinshipViewProps {
  treeId: string;
  initialPersonAId?: string;
  initialPersonBId?: string;
  onNavigatePerson: (personId: string) => void;
}

export const KinshipView: React.FC<KinshipViewProps> = ({
  treeId,
  initialPersonAId,
  initialPersonBId,
  onNavigatePerson,
}) => {
  const toast = useToast();
  const { locale, t } = useI18n();
  const [personAId, setPersonAId] = useState<string | undefined>(initialPersonAId);
  const [personBId, setPersonBId] = useState<string | undefined>(initialPersonBId);
  const [result, setResult] = useState<KinshipResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleCalculate = async () => {
    if (!personAId || !personBId) {
      toast.error('Please select both individuals');
      return;
    }

    setLoading(true);
    setHasSearched(true);
    try {
      const res = await api.getKinship(treeId, personAId, personBId);
      setResult(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('kinship.none');
      toast.error(msg);
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSwap = () => {
    setPersonAId(personBId);
    setPersonBId(personAId);
    setResult(null);
    setHasSearched(false);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-stone-200/80 p-6 sm:p-8 shadow-xs space-y-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-stone-900 tracking-tight flex items-center gap-2">
            {t('kinship.title')}
          </h1>
          <p className="text-xs text-stone-500 mt-0.5">
            {t('kinship.description')}
          </p>
        </div>

        {/* Inputs row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-stone-100 relative">
          <div>
            <PersonSearchSelect
              treeId={treeId}
              label={t('kinship.personA')}
              value={personAId}
              excludeId={personBId}
              onSelect={(p) => setPersonAId(p?.id)}
            />
          </div>

          <div>
            <PersonSearchSelect
              treeId={treeId}
              label={t('kinship.personB')}
              value={personBId}
              excludeId={personAId}
              onSelect={(p) => setPersonBId(p?.id)}
            />
          </div>
        </div>

        <div className="pt-2 flex items-center justify-between">
          <button
            type="button"
            onClick={handleSwap}
            disabled={!personAId && !personBId}
            className="text-xs text-stone-600 hover:text-stone-900 disabled:opacity-40 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 hover:bg-stone-50 cursor-pointer disabled:cursor-not-allowed transition-colors"
          >
            <Icons.Reset size={13} /> {t('kinship.swap')}
          </button>

          <button
            onClick={handleCalculate}
            disabled={!personAId || !personBId || loading}
            className="px-6 py-2.5 bg-stone-900 hover:bg-stone-800 disabled:opacity-40 text-white rounded-xl text-sm font-semibold transition-colors shadow-xs flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                {t('common.loading')}
              </>
            ) : (
              <>
                <Icons.Kinship size={16} /> {t('kinship.find')}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Result Container */}
      {result && (
        <div className="bg-white rounded-2xl border border-stone-200/80 p-6 sm:p-8 shadow-xs space-y-8 animate-in fade-in duration-200">
          {/* Classification Banner */}
          <div className="p-6 rounded-2xl bg-amber-50/70 border border-amber-200/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="text-xs font-bold uppercase tracking-wider text-amber-800">
                {t('kinship.title')}
              </div>
              <div className="text-2xl font-bold text-stone-950 capitalize">
                {kinshipTermLabel(locale, result.term)}
              </div>
              {kinshipConfidenceLabel(locale, result.term) && (
                <div className="text-xs text-amber-800 font-medium pt-1">
                  {kinshipConfidenceLabel(locale, result.term)}
                </div>
              )}
            </div>

            <div className="text-right">
              <div className="text-xs text-stone-500 font-medium">{t('kinship.degrees')}</div>
              <div className="text-3xl font-extrabold text-stone-900 font-mono">
                {result.degrees_of_sep}
              </div>
            </div>
          </div>

          {/* Step-by-Step Chain Visualization */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-stone-800">
              {t('kinship.steps')}
            </h3>

            <div className="relative pl-6 sm:pl-8 space-y-6 before:absolute before:left-2.5 sm:before:left-3.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-stone-200">
              {result.segments.length === 0 ? (
                <div className="text-sm text-stone-600">{t('kinship.selfHint')}</div>
              ) : (
                result.segments.map((seg, idx) => {
                  const fromPerson = result.individuals[seg.from_id];
                  const toPerson = result.individuals[seg.to_id];

                  const relType = seg.relationship_type?.toLowerCase();
                  const localizedRel = relType ? t(`edge.${relType}`) : t('edge.biological');
                  const unionType = seg.union_type?.toLowerCase();
                  const localizedUnion = unionType ? t(`edge.${unionType}`) : t('edge.traditional');

                  const hopLabel =
                    seg.relation === 'PARENT'
                      ? `${t('kinship.parent')} (${localizedRel})`
                      : seg.relation === 'CHILD'
                      ? `${t('kinship.child')} (${localizedRel})`
                      : `${t('kinship.spouse')} (${localizedUnion})`;

                  return (
                    <div key={idx} className="relative space-y-2">
                      {/* Step Dot */}
                      <div className="absolute -left-6 sm:-left-8 top-1.5 w-4 h-4 rounded-full bg-amber-700 border-2 border-white shadow-xs" />

                      {/* Hop Description Pill */}
                      <div className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-md bg-stone-100 text-stone-700">
                        <span>#{idx + 1}</span>
                        <span className="font-normal text-stone-600">{hopLabel}</span>
                      </div>

                      {/* Participant Cards */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        {/* From Person */}
                        <div
                          onClick={() => onNavigatePerson(seg.from_id)}
                          className="p-3 bg-stone-50 rounded-xl border border-stone-200/80 hover:bg-white transition-colors cursor-pointer"
                        >
                          <div className="text-xs text-stone-400 font-mono">From</div>
                          <div className="font-semibold text-stone-900 text-sm mt-0.5 truncate">
                            {fromPerson ? fromPerson.full_native : seg.from_id}
                          </div>
                          <div className="text-xs text-stone-500 truncate">
                            {fromPerson?.full_latin}
                          </div>
                        </div>

                        {/* To Person */}
                        <div
                          onClick={() => onNavigatePerson(seg.to_id)}
                          className="p-3 bg-stone-50 rounded-xl border border-stone-200/80 hover:bg-white transition-colors cursor-pointer"
                        >
                          <div className="text-xs text-stone-400 font-mono">To</div>
                          <div className="font-semibold text-stone-900 text-sm mt-0.5 truncate">
                            {toPerson ? toPerson.full_native : seg.to_id}
                          </div>
                          <div className="text-xs text-stone-500 truncate">
                            {toPerson?.full_latin}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {hasSearched && !loading && !result && (
        <div className="bg-white rounded-2xl border border-stone-200/80 p-12 text-center space-y-2">
          <div className="text-base font-semibold text-stone-800">{t('kinship.none')}</div>
          <p className="text-xs text-stone-500 max-w-md mx-auto">
            {t('kinship.noPathDescription')}
          </p>
        </div>
      )}
    </div>
  );
};
