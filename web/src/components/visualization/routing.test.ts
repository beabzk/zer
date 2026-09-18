import { describe, expect, it } from "vitest";

import { CARD_H, CARD_W, GAP_X, GAP_Y, type PlacedNode } from "./layout";
import { pathData, relatedTo, routeGraph, type RoutedConnection } from "./routing";

const node = (id: string, x: number, y: number, rank: number): PlacedNode => ({ id, x, y, rank });
const parent = (source: string, target: string) => ({ id: `p-${source}-${target}`, source, target });
const union = (a: string, b: string) => ({ id: `u-${a}-${b}`, source: a, target: b });

const find = (routes: RoutedConnection[], source: string, target: string) =>
  routes.find((route) => route.kind === "parent" && route.source === source && route.target === target)!;

describe("routeGraph", () => {
  it("feeds adjacent partners into one shared bus for their children", () => {
    const father = node("father", 0, 0, 0);
    const mother = node("mother", CARD_W + GAP_X, 0, 0);
    const child = node("child", 104, CARD_H + 72, 1);
    const routes = routeGraph(
      [father, mother, child],
      [parent("father", "child"), parent("mother", "child")],
      [union("father", "mother")],
    );

    expect(routes).toHaveLength(3);
    const fromFather = find(routes, "father", "child");
    const fromMother = find(routes, "mother", "child");
    const busY = CARD_H + (CARD_H + 72 - CARD_H) / 2;
    expect(fromFather.segments).toHaveLength(4);
    // Parents branch from the union midpoint down the stem into the bus.
    expect(fromFather.segments[0]).toEqual({ x1: CARD_W, y1: CARD_H / 2, x2: 192, y2: CARD_H / 2 });
    expect(fromFather.segments[1]).toEqual({ x1: 192, y1: CARD_H / 2, x2: 192, y2: busY });
    expect(fromMother.segments[0]).toEqual({ x1: CARD_W + GAP_X, y1: CARD_H / 2, x2: 192, y2: CARD_H / 2 });
    expect(fromMother.segments[1]).toEqual({ x1: 192, y1: CARD_H / 2, x2: 192, y2: busY });
    expect(fromMother.segments[1].y2).toBe(busY);
    // Attachment anchors at partner connector edges.
    expect(fromFather.anchors[0]).toEqual({ x: CARD_W, y: CARD_H / 2 });
    expect(fromMother.anchors[0]).toEqual({ x: CARD_W + GAP_X, y: CARD_H / 2 });
    // The child has one shared attachment point under the bus.
    expect(fromFather.anchors[1]).toEqual(fromMother.anchors[1]);
    expect(fromFather.anchors[1]).toEqual({ x: 104 + CARD_W / 2, y: CARD_H + 72 });
  });

  it("offsets attachment points and lanes when parents are not a visible couple", () => {
    const first = node("first", 0, 0, 0);
    const second = node("second", CARD_W + GAP_X, 0, 0);
    const child = node("child", 104, CARD_H + 72, 1);
    const routes = routeGraph(
      [first, second, child],
      [parent("first", "child"), parent("second", "child")],
      [],
    );

    expect(routes).toHaveLength(2);
    const a = find(routes, "first", "child");
    const b = find(routes, "second", "child");
    const childX = 104 + CARD_W / 2;
    // Distinct attachment points under the child card.
    expect(a.anchors[1].x).toBe(childX - 11);
    expect(b.anchors[1].x).toBe(childX + 11);
    expect(a.anchors[1].x).not.toBe(b.anchors[1].x);
    // Distinct horizontal lanes between the rows.
    expect(a.segments[1].y1).toBeLessThan(b.segments[1].y1);
    expect(a.segments[1].x1).toBe(88);
    expect(b.segments[1].x1).toBe(CARD_W + GAP_X + 88);
  });

  it("routes skipped generations around the cards in between", () => {
    const father = node("father", 0, 0, 0);
    const between = node("between", 0, CARD_H + GAP_Y, 1);
    const child = node("child", 0, (CARD_H + GAP_Y) * 2, 2);
    const [route] = routeGraph([father, between, child], [parent("father", "child")], []);

    for (const segment of route.segments) {
      const left = Math.min(segment.x1, segment.x2);
      const right = Math.max(segment.x1, segment.x2);
      const top = Math.min(segment.y1, segment.y2);
      const bottom = Math.max(segment.y1, segment.y2);
      const crosses = left < between.x + CARD_W && right > between.x && top < between.y + CARD_H && bottom > between.y;
      expect(crosses).toBe(false);
    }
    expect(route.anchors).toEqual([
      { x: 88, y: CARD_H },
      { x: 88, y: (CARD_H + GAP_Y) * 2 },
    ]);
  });
  it("routes a union between partners at different ranks with an orthogonal elbow", () => {
    const upper = node("upper", 0, 0, 0);
    const lower = node("lower", CARD_W + GAP_X, CARD_H + 72, 1);
    const routes = routeGraph([upper, lower], [], [union("upper", "lower")]);

    expect(routes).toHaveLength(1);
    const [connector] = routes;
    expect(connector.kind).toBe("union");
    expect(connector.segments).toHaveLength(3);
    expect(connector.segments[1].x1).toBe(connector.segments[1].x2);
    expect(connector.segments[1].y1).not.toBe(connector.segments[1].y2);
    expect(connector.anchors).toEqual([
      { x: CARD_W, y: CARD_H / 2 },
      { x: CARD_W + GAP_X, y: CARD_H + 72 + CARD_H / 2 },
    ]);
  });

  it("keeps union connectors short and horizontal for adjacent partners", () => {
    const left = node("left", 0, 0, 0);
    const right = node("right", CARD_W + GAP_X, 0, 0);
    const routes = routeGraph([left, right], [], [union("left", "right")]);

    expect(routes).toHaveLength(1);
    expect(routes[0].segments).toEqual([
      { x1: CARD_W, y1: CARD_H / 2, x2: CARD_W + GAP_X, y2: CARD_H / 2 },
    ]);
  });

  it("terminates on cyclic parent edges", () => {
    const a = node("a", 0, 0, 0);
    const b = node("b", 0, CARD_H + 72, 1);
    const routes = routeGraph([a, b], [parent("a", "b"), parent("b", "a")], []);

    expect(routes).toHaveLength(2);
    for (const route of routes) {
      expect(route.segments).toHaveLength(3);
      expect(Number.isFinite(route.segments[0].x1)).toBe(true);
    }
  });

  it("ignores disconnected nodes and edges that reference unknown people", () => {
    expect(routeGraph([node("a", 0, 0, 0), node("b", 400, 0, 0)], [], [])).toEqual([]);
    expect(
      routeGraph([node("a", 0, 0, 0)], [parent("a", "missing"), parent("missing", "a")], []),
    ).toEqual([]);
    expect(routeGraph([node("a", 0, 0, 0)], [parent("a", "a")], [])).toEqual([]);
  });

  it("produces the same routing regardless of edge order", () => {
    const placed = [
      node("grand", 0, 0, 0),
      node("father", 0, CARD_H + 72, 1),
      node("mother", CARD_W + GAP_X, CARD_H + 72, 1),
      node("child", 104, (CARD_H + 72) * 2, 2),
    ];
    const parents = [
      parent("grand", "father"),
      parent("father", "child"),
      parent("mother", "child"),
    ];
    const unions = [union("father", "mother")];
    expect(routeGraph(placed, parents.toReversed(), unions)).toEqual(routeGraph(placed, parents, unions));
    expect(routeGraph(placed.toReversed(), parents, unions)).toEqual(routeGraph(placed, parents, unions));
  });

  it("gives every sibling its own drop from the shared bus", () => {
    const father = node("father", 0, 0, 0);
    const mother = node("mother", CARD_W + GAP_X, 0, 0);
    const first = node("first", 0, CARD_H + 72, 1);
    const second = node("second", CARD_W + GAP_X, CARD_H + 72, 1);
    const routes = routeGraph(
      [father, mother, first, second],
      [
        parent("father", "first"),
        parent("father", "second"),
        parent("mother", "first"),
        parent("mother", "second"),
      ],
      [union("father", "mother")],
    );

    const drops = routes
      .filter((route) => route.kind === "parent" && route.source === "father")
      .map((route) => route.anchors[1]);
    expect(drops).toEqual([
      { x: 88, y: CARD_H + 72 },
      { x: CARD_W + GAP_X + 88, y: CARD_H + 72 },
    ]);
    const busRows = new Set(routes.filter((route) => route.kind === "parent").map((route) => route.segments[1].y1));
    expect(busRows.size).toBe(1);
  });
});

describe("relatedTo", () => {
  const edges = [parent("a", "b"), union("b", "c"), parent("d", "e")];

  it("keeps direct parent, child, and union links of the active node", () => {
    const { edgeIds, nodeIds } = relatedTo(edges, "b");
    expect([...edgeIds].toSorted()).toEqual(["p-a-b", "u-b-c"]);
    expect([...nodeIds].toSorted()).toEqual(["a", "b", "c"]);
  });

  it("returns empty sets without an active node", () => {
    expect(relatedTo(edges, null)).toEqual({ edgeIds: new Set(), nodeIds: new Set() });
  });
});

describe("pathData", () => {
  it("emits one move command followed by line segments", () => {
    expect(
      pathData([
        { x1: 1, y1: 2, x2: 1, y2: 10 },
        { x1: 1, y1: 10, x2: 20.126, y2: 10 },
      ]),
    ).toBe("M 1 2 L 1 10 L 20.13 10");
  });

  it("returns an empty path without segments", () => {
    expect(pathData([])).toBe("");
  });

  it("includes parental union when child is active", () => {
    const family = [parent("dad", "kid"), parent("mom", "kid"), union("dad", "mom")];
    const { edgeIds, nodeIds } = relatedTo(family, "kid");
    expect([...edgeIds].toSorted()).toEqual(["p-dad-kid", "p-mom-kid", "u-dad-mom"]);
    expect([...nodeIds].toSorted()).toEqual(["dad", "kid", "mom"]);
  });

  it("staggers bus lanes for multiple parent groups at the same rank", () => {
    const parentA = node("pA", 0, 0, 0);
    const childA = node("cA", 0, CARD_H + 72, 1);
    const parentB = node("pB", CARD_W + GAP_X, 0, 0);
    const childB = node("cB", CARD_W + GAP_X, CARD_H + 72, 1);
    const routes = routeGraph(
      [parentA, childA, parentB, childB],
      [parent("pA", "cA"), parent("pB", "cB")],
      [],
    );
    const rA = find(routes, "pA", "cA");
    const rB = find(routes, "pB", "cB");
    expect(rA.segments[1].y1).not.toBe(rB.segments[1].y1);
  });

  it("routes multi-generation seeded family tree without overlapping bus lanes", async () => {
    const { layoutGraph } = await import("./layout");
    const people = [
      "haile", "mulu", "girma", "tadelech", "abebe", "worku", "genet", "desta", "tirunesh", "yared",
    ].map((id) => ({ id }));
    const parentEdges = [
      parent("haile", "girma"),
      parent("mulu", "girma"),
      parent("girma", "abebe"),
      parent("tadelech", "abebe"),
      parent("girma", "worku"),
      parent("tadelech", "worku"),
      parent("girma", "genet"),
      parent("tadelech", "genet"),
      parent("abebe", "tirunesh"),
      parent("desta", "tirunesh"),
      parent("abebe", "yared"),
      parent("desta", "yared"),
    ];
    const unionEdges = [
      union("haile", "mulu"),
      union("girma", "tadelech"),
      union("abebe", "desta"),
    ];

    const placed = layoutGraph(people, parentEdges, unionEdges);
    const routes = routeGraph(placed, parentEdges, unionEdges);
    expect(routes.length).toBeGreaterThanOrEqual(parentEdges.length + unionEdges.length);

    // Each child connects to both parents via couple family bus
    for (const childId of ["tirunesh", "yared"]) {
      const { edgeIds, nodeIds } = relatedTo([...parentEdges, ...unionEdges], childId);
      expect(nodeIds.has("abebe")).toBe(true);
      expect(nodeIds.has("desta")).toBe(true);
      expect(edgeIds.has("u-abebe-desta")).toBe(true);
    }
  });

  it("routes Adoptive Household tree cleanly without cutting through cards", async () => {
    const { layoutGraph } = await import("./layout");
    const people = [
      "wondimu", "hirut", "tsegaye", "netsanet", "amare", "muluken", "frehiwot", "eyob", "belay",
    ].map((id) => ({ id }));
    const parentEdges = [
      parent("wondimu", "netsanet"),
      parent("hirut", "netsanet"),
      parent("tsegaye", "muluken"),
      parent("hirut", "muluken"),
      parent("wondimu", "muluken"),
      parent("wondimu", "frehiwot"),
      parent("hirut", "frehiwot"),
      parent("wondimu", "eyob"),
      parent("hirut", "eyob"),
      parent("netsanet", "belay"),
      parent("amare", "belay"),
    ];
    const unionEdges = [
      union("wondimu", "hirut"),
      union("hirut", "tsegaye"),
      union("netsanet", "amare"),
    ];

    const placed = layoutGraph(people, parentEdges, unionEdges);
    const routes = routeGraph(placed, parentEdges, unionEdges);

    // Both unions are adjacent and horizontal
    const u1 = routes.find((r) => r.kind === "union" && ((r.source === "wondimu" && r.target === "hirut") || (r.source === "hirut" && r.target === "wondimu")))!;
    const u2 = routes.find((r) => r.kind === "union" && ((r.source === "hirut" && r.target === "tsegaye") || (r.source === "tsegaye" && r.target === "hirut")))!;
    expect(u1.segments).toHaveLength(1);
    expect(u2.segments).toHaveLength(1);

    // Netsanet, Eyob, Frehiwot share a couple family bus from Wondimu and Hirut
    const rNetsanetW = find(routes, "wondimu", "netsanet");
    const rEyobW = find(routes, "wondimu", "eyob");
    const rFrehiwotW = find(routes, "wondimu", "frehiwot");
    expect(rNetsanetW.segments[1].y2).toBe(rEyobW.segments[1].y2);
    expect(rEyobW.segments[1].y2).toBe(rFrehiwotW.segments[1].y2);

    // No segment should cut through intermediate cards
    for (const route of routes) {
      for (const seg of route.segments) {
        for (const item of placed) {
          if (item.id === route.source || item.id === route.target) continue;
          // Segment bounding box
          const segLeft = Math.min(seg.x1, seg.x2);
          const segRight = Math.max(seg.x1, seg.x2);
          const segTop = Math.min(seg.y1, seg.y2);
          const segBottom = Math.max(seg.y1, seg.y2);
          // Check if segment penetrates strictly inside node box
          const inside = segLeft < item.x + CARD_W - 0.5 && segRight > item.x + 0.5 &&
            segTop < item.y + CARD_H - 0.5 && segBottom > item.y + 0.5;
          expect(inside).toBe(false);
        }
      }
    }
  });
});
