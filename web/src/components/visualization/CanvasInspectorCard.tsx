import React from "react";
import type { SubgraphNode } from "../../lib/types";
import { Icons } from "../ui/Icons";
import { useI18n } from "../../lib/i18nContext";
import { getGenderTailwindClasses } from "../../lib/genderStyles";

interface CanvasInspectorCardProps {
  node: SubgraphNode;
  onClose: () => void;
  onNavigatePerson: (personId: string) => void;
  onFocusPerson: (personId: string) => void;
}

export const CanvasInspectorCard: React.FC<CanvasInspectorCardProps> = ({
  node,
  onClose,
  onNavigatePerson,
  onFocusPerson,
}) => {
  const { t } = useI18n();
  const genderTheme = getGenderTailwindClasses(node.data.gender);

  return (
    <div className="absolute bottom-4 left-4 right-4 sm:right-auto sm:w-64 z-20 bg-white/95 backdrop-blur-md rounded-2xl border border-stone-200/90 p-3.5 shadow-2xl animate-in slide-in-from-bottom-3 duration-150 space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {/* Small vertical color strip for gender */}
          <span className={`w-1 h-7 rounded-full shrink-0 ${genderTheme.strip}`} />
          <div className="min-w-0">
            <h3 className="text-base font-bold text-stone-900 truncate">{node.data.full_native}</h3>
            <p className="text-xs text-stone-500 font-normal truncate">{node.data.full_latin}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-stone-400 hover:text-stone-700 p-1 cursor-pointer rounded-md shrink-0"
          title="Close drawer"
        >
          <Icons.X size={15} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-stone-100">
        <button
          onClick={() => onNavigatePerson(node.id)}
          className="w-full py-1.5 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
        >
          <Icons.User size={13} /> {t("workspace.profile")}
        </button>
        <button
          onClick={() => onFocusPerson(node.id)}
          className="w-full py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
        >
          <Icons.Network size={13} /> {t("canvas.focus")}
        </button>
      </div>
    </div>
  );
};
