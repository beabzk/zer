import React from "react";
import type { PersonSummary } from "../../lib/types";
import { formatLifespan } from "../../lib/utils";
import { getGenderTailwindClasses } from "../../lib/genderStyles";

interface PersonSelectRowProps {
  person: PersonSummary;
  onClick: () => void;
  showLifespan?: boolean;
  era?: string;
}

export const PersonSelectRow: React.FC<PersonSelectRowProps> = ({
  person,
  onClick,
  showLifespan = false,
  era = "EC",
}) => {
  const genderTheme = getGenderTailwindClasses(person.gender);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left p-2.5 px-3 transition-colors flex items-center justify-between cursor-pointer group ${genderTheme.dropdownRow}`}
    >
      <div className="flex items-center gap-2.5 min-w-0 pr-2">
        {/* Small vertical color strip for gender */}
        <span className={`w-1 h-5 rounded-full shrink-0 ${genderTheme.strip}`} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-stone-900 group-hover:text-stone-950 text-sm truncate">
              {person.full_native}
            </span>
            <span className="text-xs text-stone-500 truncate">({person.full_latin})</span>
          </div>
          {showLifespan && (
            <div className="text-xs text-stone-400 mt-0.5">
              {formatLifespan(person.birth_year_ec, person.death_year_ec, person.is_deceased, era)}
            </div>
          )}
        </div>
      </div>
    </button>
  );
};
