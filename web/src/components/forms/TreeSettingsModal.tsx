import React, { useState, useEffect } from "react";
import { Modal } from "../ui/Modal";
import { useToast } from "../ui/Toast";
import { api } from "../../lib/api";
import type { Tree } from "../../lib/types";
import { useI18n } from "../../lib/i18nContext";

interface TreeSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  tree: Tree;
  onSuccess: (updated: Tree) => void;
}

export const TreeSettingsModal: React.FC<TreeSettingsModalProps> = ({
  isOpen,
  onClose,
  tree,
  onSuccess,
}) => {
  const toast = useToast();
  const { t } = useI18n();

  const [name, setName] = useState(tree.name);
  const [description, setDescription] = useState(tree.description || "");
  const [defaultLang, setDefaultLang] = useState(tree.default_lang || "en");
  const [patronymicDepth, setPatronymicDepth] = useState(tree.patronymic_depth ?? 3);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setName(tree.name);
    setDescription(tree.description || "");
    setDefaultLang(tree.default_lang || "en");
    setPatronymicDepth(tree.patronymic_depth ?? 3);
  }, [tree, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Tree name is required");
      return;
    }

    setSubmitting(true);
    try {
      const updated = await api.updateTree(tree.id, {
        name: name.trim(),
        description: description.trim(),
        default_lang: defaultLang,
        patronymic_depth: patronymicDepth,
      });
      toast.success("Tree settings updated");
      onSuccess(updated);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update tree settings";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Tree Settings"
      subtitle="Configure tree profile, language, and patronymic naming depth."
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
            {t("trees.name")} *
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-white border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
            {t("trees.description")}
          </label>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-white border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600 resize-none"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
              {t("trees.language")}
            </label>
            <select
              value={defaultLang}
              onChange={(e) => setDefaultLang(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
            >
              <option value="en">English</option>
              <option value="am">አማርኛ (Amharic)</option>
              <option value="ti">ትግርኛ (Tigrinya)</option>
              <option value="om">Afaan Oromoo</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
              Patronymic Name Depth
            </label>
            <select
              value={patronymicDepth}
              onChange={(e) => setPatronymicDepth(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm bg-white border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
            >
              <option value={2}>2 Names (Given + Parent)</option>
              <option value={3}>3 Names (Default)</option>
              <option value={4}>4 Names (4 Generations)</option>
              <option value={5}>5 Names (5 Generations)</option>
              <option value={6}>6 Names (6 Generations)</option>
              <option value={7}>7 Names (7 Generations)</option>
            </select>
          </div>
        </div>

        <p className="text-[11px] text-stone-500 leading-relaxed bg-stone-50 p-2.5 rounded-lg border border-stone-200/60">
          Patronymic depth controls how many ancestor generations are appended to synthesize full names throughout the tree (e.g. 3 displays Given + Father + Grandfather).
        </p>

        <div className="pt-4 border-t border-stone-200 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-stone-600 hover:text-stone-900 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 text-sm bg-amber-700 hover:bg-amber-800 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {submitting ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
};
