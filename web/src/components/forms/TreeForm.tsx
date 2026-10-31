import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { api } from '../../lib/api';
import type { Tree } from '../../lib/types';
import { useI18n } from '../../lib/i18nContext';

interface TreeFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (tree: Tree) => void;
}

export const TreeForm: React.FC<TreeFormProps> = ({ isOpen, onClose, onSuccess }) => {
  const toast = useToast();
  const { t, locale } = useI18n();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Tree name is required');
      return;
    }

    setSubmitting(true);
    try {
      const tree = await api.createTree({
        name: name.trim(),
        slug: slug.trim() || undefined,
        description: description.trim() || undefined,
        default_lang: 'en',
      });
      toast.success(`Tree "${tree.name}" created`);
      onSuccess(tree);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create tree';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('trees.create')}
      subtitle="Each family tree maintains its own isolated database with graph relationships and events."
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
            {t('trees.name')} *
          </label>
          <input
            type="text"
            required
            placeholder={locale === 'am' || locale === 'ti' ? 'ለምሳሌ፡ የደጃዝማች ኃይሌ ቤተሰብ' : 'e.g. Wolde Lineage'}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!slug || slug === name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')) {
                setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
              }
            }}
            className="w-full px-3 py-2 text-sm bg-white border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
            Slug (Unique Identifier)
          </label>
          <input
            type="text"
            placeholder="e.g. haile-family"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-white border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600 font-mono text-xs"
          />
          <p className="text-[11px] text-stone-400 mt-1">Alphanumeric characters and hyphens only.</p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
            {t('trees.description')}
          </label>
          <textarea
            rows={3}
            placeholder="Historical notes, regional origin (e.g. Gondar, Harar, Shewa, Wollo)..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-white border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600 resize-none"
          />
        </div>

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
            {submitting ? t('common.loading') : t('trees.create')}
          </button>
        </div>
      </form>
    </Modal>
  );
};
