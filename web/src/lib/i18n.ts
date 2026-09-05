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

/** Translate a dotted key, falling back to English, then the key itself. */
export function t(locale: Locale, key: string): string {
  const hit = lookup(bundles[locale], key) ?? lookup(bundles.en, key);
  return typeof hit === "string" ? hit : key;
}

/** Thirteen month labels for the active locale, Pagume last. */
export function months(locale: Locale): string[] {
  const list = lookup(bundles[locale], "months") ?? lookup(bundles.en, "months");
  return Array.isArray(list) ? (list as string[]) : [];
}
