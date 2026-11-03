import { describe, it, expect } from "vitest";
import { buildLineageTreeLayout } from "./lineageTreeLayout";
import type { LineageNode } from "../../lib/types";

describe("lineageTreeLayout", () => {
  it("returns empty result when no nodes are provided", () => {
    const result = buildLineageTreeLayout([]);
    expect(result.nodes).toHaveLength(0);
    expect(result.connectors).toHaveLength(0);
    expect(result.width).toBe(0);
    expect(result.height).toBe(0);
  });

  it("centers root vertically between father and mother", () => {
    const nodes: LineageNode[] = [
      {
        id: "child",
        depth: 0,
        path: ["child"],
        full_native: "ህፃን",
        full_latin: "Child",
        gender: "MALE",
        is_deceased: false,
      },
      {
        id: "father",
        depth: 1,
        path: ["child", "father"],
        full_native: "አባት",
        full_latin: "Father",
        gender: "MALE",
        is_deceased: false,
      },
      {
        id: "mother",
        depth: 1,
        path: ["child", "mother"],
        full_native: "እናት",
        full_latin: "Mother",
        gender: "FEMALE",
        is_deceased: false,
      },
    ];

    const result = buildLineageTreeLayout(nodes, "ancestors", {
      cardHeight: 70,
      rowGap: 20,
      paddingY: 30,
    });

    expect(result.nodes).toHaveLength(3);
    const child = result.nodes.find((n) => n.node.id === "child")!;
    const father = result.nodes.find((n) => n.node.id === "father")!;
    const mother = result.nodes.find((n) => n.node.id === "mother")!;

    // Father (male) is on top, Mother (female) is on bottom
    expect(father.y).toBeLessThan(mother.y);
    // Child is exactly centered between father and mother
    expect(child.y).toBe((father.y + mother.y) / 2);

    // Connector paths exist for both parents
    expect(result.connectors).toHaveLength(2);
    expect(result.connectors[0].sourceKey).toBe("child");
    expect(result.connectors[1].sourceKey).toBe("child");
  });

  it("handles asymmetrical lineage where one branch has ancestors and the other does not", () => {
    const nodes: LineageNode[] = [
      {
        id: "root",
        depth: 0,
        path: ["root"],
        full_native: "Root",
        full_latin: "Root",
        gender: "MALE",
        is_deceased: false,
      },
      {
        id: "father",
        depth: 1,
        path: ["root", "father"],
        full_native: "Father",
        full_latin: "Father",
        gender: "MALE",
        is_deceased: false,
      },
      {
        id: "mother",
        depth: 1,
        path: ["root", "mother"],
        full_native: "Mother",
        full_latin: "Mother",
        gender: "FEMALE",
        is_deceased: false,
      },
      // Paternal Grandparents only
      {
        id: "pat_gf",
        depth: 2,
        path: ["root", "father", "pat_gf"],
        full_native: "PatGF",
        full_latin: "PatGF",
        gender: "MALE",
        is_deceased: false,
      },
      {
        id: "pat_gm",
        depth: 2,
        path: ["root", "father", "pat_gm"],
        full_native: "PatGM",
        full_latin: "PatGM",
        gender: "FEMALE",
        is_deceased: false,
      },
    ];

    const result = buildLineageTreeLayout(nodes, "ancestors");
    const root = result.nodes.find((n) => n.node.id === "root")!;
    const father = result.nodes.find((n) => n.node.id === "father")!;
    const mother = result.nodes.find((n) => n.node.id === "mother")!;
    const patGf = result.nodes.find((n) => n.node.id === "pat_gf")!;
    const patGm = result.nodes.find((n) => n.node.id === "pat_gm")!;

    // Father is centered between paternal grandparents
    expect(father.y).toBe((patGf.y + patGm.y) / 2);
    // Root is centered between father and mother
    expect(root.y).toBe((father.y + mother.y) / 2);
  });

  it("handles a single parent edge case cleanly", () => {
    const nodes: LineageNode[] = [
      {
        id: "child",
        depth: 0,
        path: ["child"],
        full_native: "Child",
        full_latin: "Child",
        gender: "FEMALE",
        is_deceased: false,
      },
      {
        id: "mother",
        depth: 1,
        path: ["child", "mother"],
        full_native: "Mother",
        full_latin: "Mother",
        gender: "FEMALE",
        is_deceased: false,
      },
    ];

    const result = buildLineageTreeLayout(nodes, "ancestors");
    const child = result.nodes.find((n) => n.node.id === "child")!;
    const mother = result.nodes.find((n) => n.node.id === "mother")!;

    // Single parent aligns with child
    expect(child.y).toBe(mother.y);
    expect(result.connectors).toHaveLength(1);
    expect(result.connectors[0].path).toContain("M");
  });
});
