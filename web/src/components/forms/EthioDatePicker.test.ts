import { describe, expect, it } from "vitest";
import { maxDay } from "./EthioDatePicker";
import { months, t } from "../../lib/i18n";

describe("maxDay", () => {
  it("caps Pagume at 6 and other months at 30", () => {
    expect(maxDay(13)).toBe(6);
    expect(maxDay(1)).toBe(30);
    expect(maxDay(undefined)).toBe(30);
  });
});

describe("months", () => {
  it("returns 13 labels per locale", () => {
    for (const locale of ["en", "am", "om", "ti"] as const) {
      expect(months(locale)).toHaveLength(13);
    }
  });
});

describe("t", () => {
  it("falls back to English for missing om chrome", () => {
    expect(t("om", "person.save")).toBe("Save");
    expect(t("om", "months")).toBe("months");
  });
  it("returns the key for unknown paths", () => {
    expect(t("en", "no.such.key")).toBe("no.such.key");
  });
});
