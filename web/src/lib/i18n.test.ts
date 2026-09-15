import { describe, expect, it } from "vitest";
import { localeTag, missingTranslationKeys, t } from "./i18n";

describe("locale metadata", () => {
  it("maps application locales to document language tags", () => {
    expect(localeTag("en")).toBe("en");
    expect(localeTag("am")).toBe("am");
    expect(localeTag("om")).toBe("om");
    expect(localeTag("ti")).toBe("ti");
  });

  it("reports untranslated keys without changing English fallback behavior", () => {
    expect(missingTranslationKeys("en")).toEqual([]);
    expect(missingTranslationKeys("om")).toContain("dashboard.overview");
    expect(t("om", "dashboard.overview")).toBe(t("en", "dashboard.overview"));
  });

  it("keeps kinship terminology reviewable without breaking non-English locales", () => {
    expect(missingTranslationKeys("om")).toContain("kinship.terms.sibling.female");
    expect(t("om", "kinship.terms.sibling.female")).toBe("Sister");
  });
});
