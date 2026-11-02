import React from "react";
import type { PersonSummary } from "../../lib/types";
import { Icons } from "./Icons";
import { formatLifespan } from "../../lib/utils";
import { getGenderTailwindClasses } from "../../lib/genderStyles";

interface PersonSelectedCardProps {
  person: PersonSummary;
  onClear: () => void;
  showLifespan?: boolean;
  era?: string;
}

export const PersonSelectedCard: React.FC<PersonSelectedCardProps> = ({
  person,
  onClear,
  showLifespan = false,
  era = "EC",
}) => {
  const genderTheme = getGenderTailwindClasses(person.gender);

  return (
    <div
      className={`flex items-center justify-between p-2.5 rounded-xl border transition-colors ${genderTheme.selectedCard}`}
    >
      <div className="flex items-center gap-2.5 min-w-0 pr-2">
        {/* Small vertical color strip for gender */}
        <span className={`w-1 h-6 rounded-full shrink-0 ${genderTheme.strip}`} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-stone-900 truncate text-[14.5px]">
              {person.full_native}
            </span>
            <span className="text-xs text-stone-500 truncate font-normal">
              ({person.full_latin})
            </span>
          </div>
          {showLifespan && (
            <div className="text-xs text-stone-400 mt-0.5">
              {formatLifespan(person.birth_year_ec, person.death_year_ec, person.is_deceased, era)}
            </div>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onClear}
        className="text-stone-400 hover:text-stone-700 p-1 rounded-md hover:bg-stone-200/60 transition-colors cursor-pointer shrink-0"
        title="Clear selection"
      >
        <Icons.X size={15} />
      </button>
    </div>
  );
};
