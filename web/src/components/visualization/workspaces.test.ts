import { describe, expect, it } from "vitest";
import { relationLabelKey } from "./KinshipWorkspace";

describe("relationLabelKey", () => {
  it("maps engine relations to locale keys", () => {
    expect(relationLabelKey("PARENT")).toBe("kinship.parent");
    expect(relationLabelKey("CHILD")).toBe("kinship.child");
    expect(relationLabelKey("SPOUSE")).toBe("kinship.spouse");
  });

  it("falls back to the raw relation", () => {
    expect(relationLabelKey("COUSIN")).toBe("COUSIN");
  });
});
