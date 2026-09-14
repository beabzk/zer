import { describe, expect, it } from "vitest";
import { layoutGraph } from "./layout";

const ids = (placed: { id: string }[]) => placed.map((p) => p.id);

describe("layoutGraph", () => {
  it("keeps coordinates stable when API nodes and edges arrive in a different order", () => {
    const nodes = ["haile", "mulu", "belete", "girma", "tadelech", "abebe", "desta", "genet", "worku"].map((id) => ({ id }));
    const parents = [
      { source: "haile", target: "girma" },
      { source: "mulu", target: "girma" },
      { source: "girma", target: "abebe" },
      { source: "tadelech", target: "abebe" },
      { source: "belete", target: "desta" },
      { source: "girma", target: "genet" },
      { source: "belete", target: "worku" },
    ];
    const unions = [
      { source: "haile", target: "mulu" },
      { source: "girma", target: "tadelech" },
      { source: "abebe", target: "desta" },
    ];
    const expected = layoutGraph(nodes, parents, unions);
    for (let offset = 0; offset < nodes.length; offset++) {
      const reordered = [...nodes.slice(offset), ...nodes.slice(0, offset)].toReversed();
      expect(layoutGraph(reordered, parents.toReversed(), unions.toReversed())).toEqual(expected);
      expect(layoutGraph(reordered, parents, unions.map(({ source, target }) => ({ source: target, target: source })))).toEqual(expected);
    }
  });

  it("keeps multiple partnerships stable regardless of union order", () => {
    const nodes = ["a", "b", "c", "d"].map((id) => ({ id }));
    const unions = [{ source: "a", target: "b" }, { source: "a", target: "c" }];
    expect(layoutGraph(nodes, [], unions.toReversed())).toEqual(layoutGraph(nodes, [], unions));
  });

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
