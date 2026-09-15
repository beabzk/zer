import { describe, expect, it } from "vitest";

import { formatLifeYears } from "./personSummary";

describe("formatLifeYears", () => {
  it("formats birth and death years", () => {
    expect(formatLifeYears({ birth_year_ec: 1998, death_year_ec: 2016 })).toBe("1998 EC - 2016 EC");
  });

  it("formats a birth year only", () => {
    expect(formatLifeYears({ birth_year_ec: 1998 })).toBe("1998 EC");
  });

  it("formats a death year only", () => {
    expect(formatLifeYears({ death_year_ec: 2016 })).toBe("2016 EC");
  });

  it("returns nothing when neither year is known", () => {
    expect(formatLifeYears({})).toBeUndefined();
  });
});
