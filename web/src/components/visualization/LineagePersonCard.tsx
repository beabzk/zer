import React from "react";
import type { LineageNode } from "../../lib/types";
import { formatLifespan } from "../../lib/utils";
import { getGenderTailwindClasses } from "../../lib/genderStyles";
import { Icons } from "../ui/Icons";

interface LineagePersonCardProps {
  node: LineageNode;
  isRoot?: boolean;
  era?: string;
  onClick: () => void;
}

export const LineagePersonCard: React.FC<LineagePersonCardProps> = ({
  node,
  isRoot = false,
  era = "EC",
  onClick,
}) => {
  const genderTheme = getGenderTailwindClasses(node.gender);

  return (
    <div
      onClick={onClick}
      className={`w-full h-full px-3 py-2.5 rounded-xl border transition-all duration-150 cursor-pointer group flex flex-col justify-between ${
        isRoot
          ? "bg-amber-50/25 border-amber-500 ring-2 ring-amber-500/25 shadow-xs"
          : "bg-white border-stone-200/90 hover:border-stone-400 hover:shadow-md shadow-2xs"
      }`}
    >
      {/* Top: Gender Strip + Names + Hover Arrow */}
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {/* Integrated vertical color strip for gender */}
          <span
            className={`w-1 h-6 rounded-full shrink-0 ${
              isRoot ? "bg-amber-500" : genderTheme.strip
            }`}
          />
          <div className="min-w-0 flex-1">
            <h4
              className={`font-bold text-sm truncate leading-tight ${
                isRoot ? "text-amber-950 font-bold" : "text-stone-900 group-hover:text-amber-900"
              }`}
            >
              {node.full_native}
            </h4>
            <p className="text-xs text-stone-500 truncate leading-tight mt-0.5">
              {node.full_latin}
            </p>
          </div>
        </div>

        {/* Action Icon / Root Tag */}
        <div className="shrink-0 flex items-center pt-0.5">
          {isRoot ? (
            <span className="text-[9px] font-bold uppercase tracking-wider text-amber-700 bg-amber-100/70 px-1.5 py-0.5 rounded">
              Root
            </span>
          ) : (
            <Icons.ArrowRight
              size={13}
              className="text-stone-300 group-hover:text-amber-700 group-hover:translate-x-0.5 transition-all"
            />
          )}
        </div>
      </div>

      {/* Bottom: Lifespan line */}
      <div
        className={`text-[11px] font-mono pt-1.5 border-t leading-tight truncate ${
          isRoot ? "border-amber-200/60 text-amber-800/80" : "border-stone-100 text-stone-400"
        }`}
      >
        {formatLifespan(node.birth_year_ec, node.death_year_ec, node.is_deceased, era) || "\u00A0"}
      </div>
    </div>
  );
};
