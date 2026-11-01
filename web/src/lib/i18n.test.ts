import { describe, expect, it } from "vitest";
import { localeTag, missingTranslationKeys, t, tf } from "./i18n";

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

describe("tf", () => {
  it("replaces placeholders after translation", () => {
    expect(tf("en", "graph.relationParent", { from: "Abebe", to: "Girma" })).toBe(
      "Abebe is the parent of Girma",
    );
  });

  it("keeps tokens that have no value", () => {
    expect(tf("en", "graph.relationParent", { from: "Abebe" })).toBe("Abebe is the parent of {to}");
  });

  it("falls back to the English template for locales that do not define it", () => {
    expect(tf("om", "graph.relationPartner", { from: "A", to: "B" })).toBe("A is the partner of B");
  });
});
