import { describe, expect, it } from "vitest";
import { layoutGraph } from "./layout";

const ids = (placed: { id: string }[]) => placed.map((p) => p.id);

describe("layoutGraph", () => {
  it("ranks generations and pairs spouses", () => {
    const placed = layoutGraph(
      [{ id: "gp" }, { id: "f" }, { id: "m" }, { id: "c" }],
      [
        { source: "gp", target: "f" },
        { source: "f", target: "c" },
        { source: "m", target: "c" },
      ],
      [{ source: "f", target: "m" }],
    );
    const byId = new Map(placed.map((p) => [p.id, p]));
    expect(byId.get("gp")!.rank).toBe(0);
    expect(byId.get("f")!.rank).toBe(1);
    expect(byId.get("m")!.rank).toBe(1);
    expect(byId.get("c")!.rank).toBe(2);
    // Spouses adjacent.
    expect(Math.abs(byId.get("f")!.x - byId.get("m")!.x)).toBe(176 + 32);
    expect(ids(placed)).toHaveLength(4);
  });

  it("terminates on cyclic edges", () => {
    const placed = layoutGraph(
      [{ id: "a" }, { id: "b" }],
      [
        { source: "a", target: "b" },
        { source: "b", target: "a" },
      ],
      [],
    );
    expect(ids(placed).toSorted()).toEqual(["a", "b"]);
  });

  it("handles single nodes and empty graphs", () => {
    expect(layoutGraph([], [], [])).toEqual([]);
    const [only] = layoutGraph([{ id: "x" }], [], []);
    expect(only.x).toBe(0);
    expect(only.y).toBe(0);
  });
});
