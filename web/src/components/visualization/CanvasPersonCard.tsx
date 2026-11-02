import React from "react";
import type { LayoutCard } from "./familyTreeLayout";
import { formatLifespan } from "../../lib/utils";
import { getGenderCanvasTheme } from "../../lib/genderStyles";

interface CanvasPersonCardProps {
  card: LayoutCard;
  isSelected: boolean;
  era: string;
  onClick: () => void;
  onDoubleClick: () => void;
}

export const CanvasPersonCard: React.FC<CanvasPersonCardProps> = ({
  card,
  isSelected,
  era,
  onClick,
  onDoubleClick,
}) => {
  const isRoot = card.isRoot;
  const theme = getGenderCanvasTheme(card.data.gender, isRoot, isSelected);

  return (
    <g
      transform={`translate(${card.x}, ${card.y})`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className="cursor-pointer group"
    >
      {/* Active Selection Glow Ring */}
      {isSelected && (
        <rect
          x="-4"
          y="-4"
          width={card.width + 8}
          height={card.height + 8}
          rx="14"
          ry="14"
          fill="none"
          stroke="#d97706"
          strokeWidth="2"
          strokeDasharray="4 2"
        />
      )}

      {/* Card Body with Gender-Tinted Low-Opacity Fill */}
      <rect
        width={card.width}
        height={card.height}
        rx="10"
        ry="10"
        fill={theme.fill}
        stroke={theme.stroke}
        strokeWidth={isRoot ? "2.5" : isSelected ? "2" : "1"}
        filter={isRoot ? "url(#focusGlow)" : "url(#cardShadow)"}
        className="transition-all duration-150 group-hover:stroke-stone-400"
      />

      {/* Primary Name (Native Script) */}
      <text
        x="14"
        y="26"
        fontSize="14.5"
        fontWeight="700"
        fill={theme.textPrimary}
        className="font-sans pointer-events-none"
      >
        {card.data.given_name_native}
      </text>

      {/* Secondary Name (Latin Transliteration) */}
      <text
        x="14"
        y="44"
        fontSize="11.5"
        fontWeight="500"
        fill={theme.textSecondary}
        className="font-sans pointer-events-none"
      >
        {card.data.given_name_latin}
      </text>

      {/* Lifespan */}
      <text
        x="14"
        y="61"
        fontSize="10"
        fontWeight="400"
        fill={theme.textLifespan}
        className="font-sans pointer-events-none"
      >
        {formatLifespan(
          card.data.birth_year_ec,
          card.data.death_year_ec,
          card.data.is_deceased,
          era,
        )}
      </text>
    </g>
  );
};
