import type { Gender } from "./types";

export interface CanvasGenderTheme {
  fill: string;
  stroke: string;
  textPrimary: string;
  textSecondary: string;
  textLifespan: string;
}

export function getGenderCanvasTheme(
  gender: Gender | string | undefined,
  isRoot = false,
  isSelected = false,
): CanvasGenderTheme {
  const isFemale = gender === "FEMALE";
  const isMale = gender === "MALE";

  // Low-opacity pastel fills for canvas cards
  const fill = isFemale ? "#fff1f2" : isMale ? "#eff6ff" : "#fafaf9";

  let stroke = isFemale ? "#fecdd3" : isMale ? "#bfdbfe" : "#e7e5e4";
  if (isSelected) {
    stroke = "#b45309";
  }
  if (isRoot) {
    stroke = "#d97706";
  }

  return {
    fill,
    stroke,
    textPrimary: isRoot ? "#92400e" : "#1c1917",
    textSecondary: "#57534e",
    textLifespan: "#78716c",
  };
}

export function getGenderStripClass(gender: Gender | string | undefined): string {
  switch (gender) {
    case "FEMALE":
      return "bg-rose-400";
    case "MALE":
      return "bg-blue-400";
    default:
      return "bg-stone-300";
  }
}

export interface GenderTailwindTheme {
  strip: string;
  selectedCard: string;
  dropdownRow: string;
}

export function getGenderTailwindClasses(gender: Gender | string | undefined): GenderTailwindTheme {
  const strip = getGenderStripClass(gender);

  return {
    strip,
    selectedCard: "bg-stone-50 border-stone-200 text-stone-900",
    dropdownRow: "hover:bg-stone-50/80 transition-colors text-stone-900",
  };
}
