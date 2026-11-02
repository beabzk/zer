import { describe, it, expect } from "vitest";
import {
  getGenderCanvasTheme,
  getGenderTailwindClasses,
  getGenderStripClass,
} from "./genderStyles";

describe("genderStyles", () => {
  describe("getGenderCanvasTheme", () => {
    it("returns rose pastel fill for female", () => {
      const theme = getGenderCanvasTheme("FEMALE");
      expect(theme.fill).toBe("#fff1f2");
      expect(theme.stroke).toBe("#fecdd3");
    });

    it("returns blue pastel fill for male", () => {
      const theme = getGenderCanvasTheme("MALE");
      expect(theme.fill).toBe("#eff6ff");
      expect(theme.stroke).toBe("#bfdbfe");
    });

    it("prioritizes root stroke color when isRoot is true", () => {
      const theme = getGenderCanvasTheme("MALE", true, false);
      expect(theme.stroke).toBe("#d97706");
      expect(theme.textPrimary).toBe("#92400e");
    });

    it("prioritizes selected stroke color when isSelected is true and not root", () => {
      const theme = getGenderCanvasTheme("FEMALE", false, true);
      expect(theme.stroke).toBe("#b45309");
    });
  });

  describe("getGenderStripClass", () => {
    it("returns rose-400 for female", () => {
      expect(getGenderStripClass("FEMALE")).toBe("bg-rose-400");
    });

    it("returns blue-400 for male", () => {
      expect(getGenderStripClass("MALE")).toBe("bg-blue-400");
    });

    it("returns stone-300 for undefined", () => {
      expect(getGenderStripClass(undefined)).toBe("bg-stone-300");
    });
  });

  describe("getGenderTailwindClasses", () => {
    it("returns appropriate strip class for female", () => {
      const classes = getGenderTailwindClasses("FEMALE");
      expect(classes.strip).toBe("bg-rose-400");
      expect(classes.selectedCard).toContain("bg-stone-50");
    });

    it("returns appropriate strip class for male", () => {
      const classes = getGenderTailwindClasses("MALE");
      expect(classes.strip).toBe("bg-blue-400");
      expect(classes.selectedCard).toContain("bg-stone-50");
    });

    it("returns fallback strip class for undefined gender", () => {
      const classes = getGenderTailwindClasses(undefined);
      expect(classes.strip).toBe("bg-stone-300");
    });
  });
});
