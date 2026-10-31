import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { PersonSearchSelect } from '../ui/PersonSearchSelect';
import { useToast } from '../ui/Toast';
import { api } from '../../lib/api';
import type { RelationshipType, UnionType, UnionStatus } from '../../lib/types';
import { useI18n } from '../../lib/i18nContext';

interface RelationshipFormProps {
  isOpen: boolean;
  onClose: () => void;
  treeId: string;
  initialMode?: 'parent_child' | 'union';
  defaultPersonId?: string;
  defaultRole?: 'parent' | 'child' | 'partner';
  onSuccess: () => void;
}

export const RelationshipForm: React.FC<RelationshipFormProps> = ({
  isOpen,
  onClose,
  treeId,
  initialMode = 'parent_child',
  defaultPersonId,
  defaultRole = 'parent',
  onSuccess,
}) => {
  const toast = useToast();
  const { t } = useI18n();
  const [mode, setMode] = useState<'parent_child' | 'union'>(initialMode);
  const [submitting, setSubmitting] = useState(false);

  // Parent-child state
  const [parentId, setParentId] = useState<string | undefined>(
    defaultRole === 'parent' ? defaultPersonId : undefined
  );
  const [childId, setChildId] = useState<string | undefined>(
    defaultRole === 'child' ? defaultPersonId : undefined
  );
  const [relationshipType, setRelationshipType] = useState<RelationshipType>('BIOLOGICAL');
  const [isNameSource, setIsNameSource] = useState(true);

  // Union state
  const [partnerAId, setPartnerAId] = useState<string | undefined>(defaultPersonId);
  const [partnerBId, setPartnerBId] = useState<string | undefined>(undefined);
  const [unionType, setUnionType] = useState<UnionType>('TRADITIONAL');
  const [unionStatus, setUnionStatus] = useState<UnionStatus>('ACTIVE');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      if (mode === 'parent_child') {
        if (!parentId || !childId) {
          toast.error('Both parent and child must be selected');
          return;
        }
        if (parentId === childId) {
          toast.error('Parent and child cannot be the same individual');
          return;
        }

        await api.addParentChild(treeId, {
          parent_id: parentId,
          child_id: childId,
          relationship_type: relationshipType,
          is_name_source: isNameSource,
        });

        toast.success('Parent-child relationship added successfully');
      } else {
        if (!partnerAId || !partnerBId) {
          toast.error('Both partners must be selected');
          return;
        }
        if (partnerAId === partnerBId) {
          toast.error('Partners must differ');
          return;
        }

        await api.addUnion(treeId, {
          partner_a_id: partnerAId,
          partner_b_id: partnerBId,
          union_type: unionType,
          status: unionStatus,
        });

        toast.success('Union recorded successfully');
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to record relationship';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('edge.editRelationship')}
      subtitle="Define parent-child or partner union relationships in the family graph."
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Toggle Mode */}
        <div className="flex rounded-lg border border-stone-200 bg-stone-100 p-0.5 text-xs font-medium">
          <button
            type="button"
            onClick={() => setMode('parent_child')}
            className={`flex-1 py-1.5 rounded-md transition-colors cursor-pointer text-center ${
              mode === 'parent_child'
                ? 'bg-white text-stone-900 shadow-xs'
                : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            {t('kinship.parent')} & {t('kinship.child')}
          </button>
          <button
            type="button"
            onClick={() => setMode('union')}
            className={`flex-1 py-1.5 rounded-md transition-colors cursor-pointer text-center ${
              mode === 'union'
                ? 'bg-white text-stone-900 shadow-xs'
                : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            {t('kinship.spouse')} / {t('trees.unions')}
          </button>
        </div>

        {mode === 'parent_child' ? (
          <div className="space-y-4">
            <PersonSearchSelect
              treeId={treeId}
              label={t('kinship.parent')}
              value={parentId}
              excludeId={childId}
              onSelect={(p) => setParentId(p?.id)}
            />

            <PersonSearchSelect
              treeId={treeId}
              label={t('kinship.child')}
              value={childId}
              excludeId={parentId}
              onSelect={(p) => setChildId(p?.id)}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
                  {t('edge.relationshipType')}
                </label>
                <select
                  value={relationshipType}
                  onChange={(e) => setRelationshipType(e.target.value as RelationshipType)}
                  className="w-full px-3 py-2 text-sm bg-white border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
                >
                  <option value="BIOLOGICAL">{t('edge.biological')}</option>
                  <option value="ADOPTIVE">{t('edge.adoptive')}</option>
                  <option value="FOSTER">{t('edge.foster')}</option>
                </select>
              </div>

              <div className="flex flex-col justify-end">
                <div className="flex items-center gap-2 p-2 rounded-lg bg-stone-50 border border-stone-200">
                  <input
                    type="checkbox"
                    id="is_name_source"
                    checked={isNameSource}
                    onChange={(e) => setIsNameSource(e.target.checked)}
                    className="w-4 h-4 text-amber-600 border-stone-300 rounded focus:ring-amber-500 cursor-pointer"
                  />
                  <label htmlFor="is_name_source" className="text-xs font-medium text-stone-800 cursor-pointer select-none">
                    {t('edge.nameSource')}
                  </label>
                </div>
                <p className="text-[11px] text-stone-400 mt-1">
                  {t('edge.nameSourceHint')}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <PersonSearchSelect
              treeId={treeId}
              label={`${t('kinship.spouse')} 1`}
              value={partnerAId}
              excludeId={partnerBId}
              onSelect={(p) => setPartnerAId(p?.id)}
            />

            <PersonSearchSelect
              treeId={treeId}
              label={`${t('kinship.spouse')} 2`}
              value={partnerBId}
              excludeId={partnerAId}
              onSelect={(p) => setPartnerBId(p?.id)}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
                  {t('edge.unionType')}
                </label>
                <select
                  value={unionType}
                  onChange={(e) => setUnionType(e.target.value as UnionType)}
                  className="w-full px-3 py-2 text-sm bg-white border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
                >
                  <option value="TRADITIONAL">{t('edge.traditional')}</option>
                  <option value="RELIGIOUS">{t('edge.religious')}</option>
                  <option value="CIVIL">{t('edge.civil')}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
                  {t('edge.status')}
                </label>
                <select
                  value={unionStatus}
                  onChange={(e) => setUnionStatus(e.target.value as UnionStatus)}
                  className="w-full px-3 py-2 text-sm bg-white border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
                >
                  <option value="ACTIVE">{t('edge.active')}</option>
                  <option value="DISSOLVED">{t('edge.dissolved')}</option>
                  <option value="WIDOWED">{t('edge.widowed')}</option>
                </select>
              </div>
            </div>
          </div>
        )}

        <div className="pt-4 border-t border-stone-200 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100 rounded-lg transition-colors cursor-pointer"
          >
            {t('person.cancel')}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2 text-sm font-medium text-white bg-amber-700 hover:bg-amber-800 disabled:opacity-50 rounded-lg transition-colors shadow-xs cursor-pointer"
          >
            {submitting ? t('common.loading') : t('person.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
};
