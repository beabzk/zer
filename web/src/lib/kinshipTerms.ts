import type { KinshipTerm, KinshipTermComposition } from "./types";
import { t, type Locale } from "./i18n";

type GenderKey = "female" | "male" | "default";

const modifiersBeforeTerm = ["former", "step", "half", "full", "adoptive", "foster"];
const modifiersAfterTerm = ["by_marriage"];

function genderKey(gender: string): GenderKey {
  if (gender === "FEMALE") return "female";
  if (gender === "MALE") return "male";
  return "default";
}

function interpolate(template: string, count: number): string {
  return template.replace("{count}", String(count));
}

function genderedTermLabel(locale: Locale, key: string, gender: string): string {
  return t(locale, `kinship.terms.${key}.${genderKey(gender)}`);
}

function degreeLabel(locale: Locale, degree: number): string {
  const namedDegrees: Record<number, string> = {
    1: "first",
    2: "second",
    3: "third",
    4: "fourth",
    5: "fifth",
    6: "sixth",
    7: "seventh",
    8: "eighth",
    9: "ninth",
    10: "tenth",
  };
  const named = namedDegrees[degree];
  if (named) return t(locale, `kinship.degreeLabels.${named}`);
  const suffix = degree % 100 >= 11 && degree % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][degree % 10] ?? "th";
  return `${degree}${suffix}`;
}

function removalLabel(locale: Locale, removed: number): string {
  if (removed === 1) return t(locale, "kinship.removed.once");
  if (removed === 2) return t(locale, "kinship.removed.twice");
  return interpolate(t(locale, "kinship.removed.multiple"), removed);
}

function greatPrefix(locale: Locale, count: number | undefined): string {
  if (!count || count < 1) return "";
  return `${Array.from({ length: count }, () => t(locale, "kinship.modifiers.great")).join("-")} `;
}

function lowerFirst(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function baseTermLabel(locale: Locale, term: KinshipTerm): string {
  if (term.key === "ancestor") {
    return t(locale, "kinship.terms.ancestor");
  }
  if (term.key === "descendant") {
    return t(locale, "kinship.terms.descendant");
  }
  if (term.key === "cousin" || term.key === "cousin_in_law") {
    const degree = term.parameters.degree ?? 1;
    return `${degreeLabel(locale, degree)} ${t(locale, `kinship.terms.${term.key}`)}`;
  }
  return genderedTermLabel(locale, term.key, term.gender);
}

function termSuffix(locale: Locale, term: KinshipTerm): string {
  if (term.key === "ancestor" && term.parameters.generations_up) {
    return `, ${interpolate(t(locale, "kinship.parameters.generationsUp"), term.parameters.generations_up)}`;
  }
  if (term.key === "descendant" && term.parameters.generations_down) {
    return `, ${interpolate(t(locale, "kinship.parameters.generationsDown"), term.parameters.generations_down)}`;
  }
  if ((term.key === "cousin" || term.key === "cousin_in_law") && term.parameters.removed) {
    return ` ${removalLabel(locale, term.parameters.removed)}`;
  }
  return "";
}

function modifierLabels(locale: Locale, term: KinshipTerm, placement: "before" | "after"): string[] {
  const order = placement === "before" ? modifiersBeforeTerm : modifiersAfterTerm;
  return order
    .filter((modifier) => term.modifiers?.includes(modifier))
    .map((modifier) => t(locale, `kinship.modifiers.${modifier}`));
}

function compositionPartLabel(locale: Locale, part: KinshipTermComposition): string {
  if (part.role === "spouse") {
    return `${genderedTermLabel(locale, part.key, part.gender)}'s`;
  }
  const label = kinshipTermLabel(locale, {
    perspective: "a_to_b",
    key: part.key,
    gender: part.gender,
    modifiers: part.modifiers,
    parameters: {},
    confidence: "exact",
  });
  return part.role === "anchor" ? `${label}'s` : label;
}

export function kinshipTermLabel(locale: Locale, term: KinshipTerm): string {
  if (term.key === "composed" && term.composition?.length) {
    return term.composition
      .map((part) => compositionPartLabel(locale, part))
      .map((label, index) => index === 0 ? label : lowerFirst(label))
      .join(" ");
  }

  const before = modifierLabels(locale, term, "before");
  const after = modifierLabels(locale, term, "after");
  const great = term.key === "aunt_uncle" || term.key === "niece_nephew"
    ? greatPrefix(locale, term.parameters.great_count)
    : "";
  let base = `${great}${baseTermLabel(locale, term)}`;
  if (great) base = `${great}${lowerFirst(baseTermLabel(locale, term))}`;
  if (before.length) base = lowerFirst(base);
  return [...before, base, ...after].join(" ").trim() + termSuffix(locale, term);
}

export function kinshipConfidenceLabel(locale: Locale, term: KinshipTerm): string {
  if (term.confidence === "exact") return "";
  return t(locale, `kinship.confidence.${term.confidence}`);
}
