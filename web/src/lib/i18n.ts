import en from "../locales/en.json";
import am from "../locales/am.json";
import om from "../locales/om.json";
import ti from "../locales/ti.json";

export type Locale = "en" | "am" | "om" | "ti";

export const localeNames: Record<Locale, string> = {
  en: "English",
  am: "አማርኛ",
  om: "Afaan Oromoo",
  ti: "ትግርኛ",
};

const localeTags: Record<Locale, string> = {
  en: "en",
  am: "am",
  om: "om",
  ti: "ti",
};

type Bundle = Record<string, unknown>;

const bundles: Record<Locale, Bundle> = {
  en: en as Bundle,
  am: am as Bundle,
  om: om as Bundle,
  ti: ti as Bundle,
};

function lookup(bundle: Bundle, key: string): unknown {
  return key.split(".").reduce<unknown>((node, part) => {
    if (typeof node === "object" && node !== null && part in node) {
      return (node as Bundle)[part];
    }
    return undefined;
  }, bundle);
}

function keys(bundle: Bundle, prefix = ""): string[] {
  return Object.entries(bundle).flatMap(([part, value]) => {
    const key = prefix ? `${prefix}.${part}` : part;
    return value && typeof value === "object" && !Array.isArray(value)
      ? keys(value as Bundle, key)
      : [key];
  });
}

/** BCP-47 language tag used for document and assistive-technology metadata. */
export function localeTag(locale: Locale): string {
  return localeTags[locale];
}

/** Keys that currently fall back to English for a locale. */
export function missingTranslationKeys(locale: Locale): string[] {
  if (locale === "en") return [];
  const englishKeys = keys(bundles.en);
  const translatedKeys = new Set(keys(bundles[locale]));
  return englishKeys.filter((key) => !translatedKeys.has(key));
}

/** Translate a dotted key, falling back to English, then the key itself. */
export function t(locale: Locale, key: string): string {
  const hit = lookup(bundles[locale], key) ?? lookup(bundles.en, key);
  return typeof hit === "string" ? hit : key;
}

/** Translate a dotted key and replace {placeholder} tokens with values. */
export function tf(locale: Locale, key: string, values: Record<string, string | number>): string {
  return t(locale, key).replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}
/** Thirteen month labels for the active locale, Pagume last. */
export function months(locale: Locale): string[] {
  const list = lookup(bundles[locale], "months") ?? lookup(bundles.en, "months");
  return Array.isArray(list) ? (list as string[]) : [];
}
