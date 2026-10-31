import { describe, expect, it } from "vitest";

import type { KinshipTerm } from "./types";
import { kinshipConfidenceLabel, kinshipTermLabel } from "./kinshipTerms";

function term(overrides: Partial<KinshipTerm>): KinshipTerm {
  return {
    perspective: "a_to_b",
    key: "related",
    gender: "FEMALE",
    parameters: {},
    confidence: "exact",
    ...overrides,
  };
}

describe("kinship term formatting", () => {
  it("uses target gender and path modifiers", () => {
    expect(kinshipTermLabel("en", term({
      key: "sibling",
      modifiers: ["step"],
    }))).toBe("Step sister");
  });

  it("interpolates cousin degree and removal", () => {
    expect(kinshipTermLabel("en", term({
      key: "cousin",
      modifiers: ["half"],
      parameters: { degree: 1, removed: 1 },
    }))).toBe("Half first cousin once removed");
  });

  it("applies great and by-marriage modifiers", () => {
    expect(kinshipTermLabel("en", term({
      key: "aunt_uncle",
      gender: "FEMALE",
      modifiers: ["by_marriage"],
      parameters: { great_count: 1 },
    }))).toBe("Great aunt by marriage");
  });

  it("interpolates generation parameters", () => {
    expect(kinshipTermLabel("en", term({
      key: "ancestor",
      parameters: { generations_up: 3 },
    }))).toBe("Ancestor, 3 generations up");
  });

  it("composes uncommon affinal terms", () => {
    expect(kinshipTermLabel("en", term({
      key: "composed",
      composition: [
        { role: "anchor", key: "aunt_uncle", gender: "FEMALE" },
        { role: "spouse", key: "spouse", gender: "FEMALE", union_status: "ACTIVE" },
        { role: "relative", key: "sibling", gender: "FEMALE" },
      ],
    }))).toBe("Aunt's wife's sister");
  });

  it("falls back to English terminology for locales awaiting review", () => {
    const value = term({ key: "sibling", modifiers: ["half"] });
    expect(kinshipTermLabel("om", value)).toBe("Half sister");
    expect(kinshipConfidenceLabel("om", { ...value, confidence: "incomplete_parent_records" }))
      .toBe("Incomplete parent records");
  });
});
