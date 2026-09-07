import { describe, expect, it } from "vitest";
import { groupByDepth } from "./LineageWorkspace";
import { relationLabelKey } from "./KinshipWorkspace";

describe("groupByDepth", () => {
  it("groups nodes by depth in ascending order", () => {
    const groups = groupByDepth([
      { id: "c", depth: 2 },
      { id: "a", depth: 0 },
      { id: "b", depth: 1 },
    ]);
    expect(groups.map((g) => g.depth)).toEqual([0, 1, 2]);
    expect(groups[0].ids).toEqual(["a"]);
    expect(groups[2].ids).toEqual(["c"]);
  });

  it("returns an empty list without nodes", () => {
    expect(groupByDepth([])).toEqual([]);
  });
});

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
