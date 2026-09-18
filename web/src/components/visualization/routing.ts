import { CARD_H, CARD_W, GAP_X, GAP_Y, type PlacedNode } from "./layout";

/** Relationship edge passed to the router. Parent edges point from parent to
  child; union edges connect two partners in either order. */
export interface RoutingEdge {
  id: string;
  source: string;
  target: string;
}

export interface RoutePoint {
  x: number;
  y: number;
}

export interface RouteSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface RoutedConnection {
  id: string;
  kind: "parent" | "union";
  source: string;
  target: string;
  segments: RouteSegment[];
  anchors: RoutePoint[];
}

/** Minimum clearance kept between a card edge and the first elbow. */
const MIN_ELBOW = 18;
/** Horizontal spread between attachment points on a child card. */
const ATTACH_SPREAD = 22;
/** Vertical spread between sibling parent lanes when parents are not a couple. */
const LANE_SPREAD = 8;

const NUL = "\u0000";

function pairKey(a: string, b: string): string {
  return a < b ? `${a}${NUL}${b}` : `${b}${NUL}${a}`;
}

function centerX(node: PlacedNode): number {
  return node.x + CARD_W / 2;
}

function centerY(node: PlacedNode): number {
  return node.y + CARD_H / 2;
}

function byRankThenX(a: PlacedNode, b: PlacedNode): number {
  return a.rank - b.rank || a.x - b.x || a.id.localeCompare(b.id);
}

function byXThenId(a: PlacedNode, b: PlacedNode): number {
  return a.x - b.x || a.id.localeCompare(b.id);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** SVG path data for a routed connection. */
export function pathData(segments: RouteSegment[]): string {
  if (segments.length === 0) return "";
  const [first] = segments;
  const parts = [`M ${round(first.x1)} ${round(first.y1)}`];
  for (const segment of segments) {
    parts.push(`L ${round(segment.x2)} ${round(segment.y2)}`);
  }
  return parts.join(" ");
}

/** Edges and nodes directly linked to the active node. */
export interface RelationSets {
  edgeIds: Set<string>;
  nodeIds: Set<string>;
}

/** Direct parent, child, and union links for a hovered, focused, or selected node. */
export function relatedTo(edges: RoutingEdge[], activeId: string | null): RelationSets {
  const edgeIds = new Set<string>();
  const nodeIds = new Set<string>();
  if (!activeId) return { edgeIds, nodeIds };
  nodeIds.add(activeId);
  for (const edge of edges) {
    if (edge.source === activeId || edge.target === activeId) {
      edgeIds.add(edge.id);
      nodeIds.add(edge.source);
      nodeIds.add(edge.target);
    }
  }
  for (const edge of edges) {
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
      edgeIds.add(edge.id);
    }
  }
  return { edgeIds, nodeIds };
}

function dedupe(edges: RoutingEdge[], keyOf: (edge: RoutingEdge) => string): RoutingEdge[] {
  const kept = new Map<string, RoutingEdge>();
  for (const edge of edges) {
    if (edge.source === edge.target) continue;
    const key = keyOf(edge);
    const hit = kept.get(key);
    if (!hit || edge.id.localeCompare(hit.id) < 0) kept.set(key, edge);
  }
  return [...kept.values()].toSorted((a, b) => a.id.localeCompare(b.id));
}

/**
 * Deterministic orthogonal routing for the family canvas.
 *
 * Children that share the same visible parent set are routed as one group.
 * Adjacent partners feed a shared horizontal bus; parents that are not a
 * visible couple fan out through separate lanes with distinct attachment
 * points. Union edges become short connectors between the partners.
 */
export function routeGraph(
  placed: PlacedNode[],
  parentEdges: RoutingEdge[],
  unionEdges: RoutingEdge[],
): RoutedConnection[] {
  const byId = new Map(placed.map((node) => [node.id, node]));
  const parents = dedupe(parentEdges, (edge) => `${edge.source}${NUL}${edge.target}`).filter(
    (edge) => byId.has(edge.source) && byId.has(edge.target),
  );
  const unions = dedupe(unionEdges, (edge) => pairKey(edge.source, edge.target)).filter(
    (edge) => byId.has(edge.source) && byId.has(edge.target),
  );
  const unionPairs = new Set(unions.map((edge) => pairKey(edge.source, edge.target)));
  const out: RoutedConnection[] = [];
  out.push(...routeUnions(unions, byId));
  out.push(...routeParents(parents, byId, unionPairs));
  return out;
}

function routeUnions(
  edges: RoutingEdge[],
  byId: Map<string, PlacedNode>,
): RoutedConnection[] {
  const out: RoutedConnection[] = [];
  for (const edge of edges) {
    const a = byId.get(edge.source);
    const b = byId.get(edge.target);
    if (!a || !b) continue;
    const [left, right] = [a, b].toSorted(byRankThenX);
    const y1 = centerY(left);
    const y2 = centerY(right);
    if (left.rank === right.rank) {
      const x1 = left.x + CARD_W;
      const x2 = right.x;
      if (x2 >= x1) {
        if (x2 - x1 <= GAP_X + 1) {
          out.push(connection(edge, "union", [
            { x1, y1, x2, y2: y1 },
          ], [{ x: x1, y: y1 }, { x: x2, y: y1 }]));
        } else {
          const gutterY = left.y - MIN_ELBOW;
          out.push(connection(edge, "union", [
            { x1, y1, x2: x1, y2: gutterY },
            { x1, y1: gutterY, x2, y2: gutterY },
            { x1: x2, y1: gutterY, x2, y2 },
          ], [{ x: x1, y: y1 }, { x: x2, y: y2 }]));
        }
      } else {
        const mid = (x1 + x2) / 2;
        out.push(connection(edge, "union", [
          { x1, y1, x2: mid, y2: y1 },
          { x1: mid, y1, x2: mid, y2 },
          { x1: mid, y1: y2, x2, y2 },
        ], [{ x: x1, y: y1 }, { x: x2, y: y2 }]));
      }
      continue;
    }
    const x1 = left.x + CARD_W;
    const x2 = right.x;
    const midX = (x1 + x2) / 2;
    out.push(connection(edge, "union", [
      { x1, y1, x2: midX, y2: y1 },
      { x1: midX, y1, x2: midX, y2 },
      { x1: midX, y1: y2, x2, y2 },
    ], [{ x: x1, y: y1 }, { x: x2, y: y2 }]));
  }
  return out;
}

function connection(
  edge: RoutingEdge,
  kind: RoutedConnection["kind"],
  segments: RouteSegment[],
  anchors: RoutePoint[],
): RoutedConnection {
  return { id: edge.id, kind, source: edge.source, target: edge.target, segments, anchors };
}

function areAdjacentPartners(nodes: PlacedNode[], unionPairs: Set<string>): boolean {
  if (nodes.length < 2) return false;
  const rank = nodes[0].rank;
  const ordered = [...nodes].toSorted(byXThenId);
  for (let i = 0; i < ordered.length; i++) {
    if (ordered[i].rank !== rank) return false;
    if (i === 0) continue;
    const previous = ordered[i - 1];
    if (ordered[i].x - previous.x !== CARD_W + GAP_X) return false;
    if (!unionPairs.has(pairKey(previous.id, ordered[i].id))) return false;
  }
  return true;
}

function groupBusY(band: { low: number; high: number }, index: number, total: number): number {
  if (total <= 1) return (band.low + band.high) / 2;
  const step = (band.high - band.low) / (total + 1);
  return band.low + (index + 1) * step;
}

function routeParents(
  edges: RoutingEdge[],
  byId: Map<string, PlacedNode>,
  unionPairs: Set<string>,
): RoutedConnection[] {
  const parentsOf = new Map<string, string[]>();
  for (const edge of edges) {
    const list = parentsOf.get(edge.target) ?? [];
    if (!list.includes(edge.source)) list.push(edge.source);
    parentsOf.set(edge.target, list);
  }

  const groups = new Map<string, { parents: string[]; children: string[] }>();
  for (const child of [...parentsOf.keys()].toSorted()) {
    const parents = (parentsOf.get(child) ?? []).toSorted();
    const signature = parents.join("|");
    const group = groups.get(signature) ?? { parents, children: [] };
    group.children.push(child);
    groups.set(signature, group);
  }

  interface GroupData {
    signature: string;
    parentNodes: PlacedNode[];
    childNodes: PlacedNode[];
    couple: boolean;
    rank: number;
    minX: number;
  }

  const groupList: GroupData[] = [];
  for (const signature of [...groups.keys()].toSorted()) {
    const group = groups.get(signature)!;
    const parentNodes = group.parents
      .map((id) => byId.get(id))
      .filter((node): node is PlacedNode => Boolean(node))
      .toSorted(byXThenId);
    if (parentNodes.length === 0) continue;
    const childNodes = group.children
      .map((id) => byId.get(id))
      .filter((node): node is PlacedNode => Boolean(node))
      .toSorted(byXThenId);
    const couple = areAdjacentPartners(parentNodes, unionPairs);
    const rank = parentNodes[0].rank;
    const minX = Math.min(...parentNodes.map((n) => n.x));
    groupList.push({ signature, parentNodes, childNodes, couple, rank, minX });
  }

  const groupsByRank = new Map<number, GroupData[]>();
  for (const g of groupList) {
    const list = groupsByRank.get(g.rank) ?? [];
    list.push(g);
    groupsByRank.set(g.rank, list);
  }
  for (const [, list] of groupsByRank) {
    list.sort((a, b) => a.minX - b.minX || a.signature.localeCompare(b.signature));
  }

  const out: RoutedConnection[] = [];
  for (const g of groupList) {
    const rankGroups = groupsByRank.get(g.rank) ?? [g];
    const groupIndex = rankGroups.findIndex((item) => item.signature === g.signature);
    const firstChild = g.childNodes[0];
    const downward = firstChild ? centerY(firstChild) >= centerY(g.parentNodes[0]) : true;
    const parentAttachY = downward ? g.parentNodes[0].y + CARD_H : g.parentNodes[0].y;
    const childAttachY = firstChild ? (downward ? firstChild.y : firstChild.y + CARD_H) : parentAttachY + GAP_Y;
    const band = laneBand(parentAttachY, childAttachY, downward);
    const busY = groupBusY(band, groupIndex >= 0 ? groupIndex : 0, rankGroups.length);

    for (const child of g.childNodes) {
      if (g.couple && g.parentNodes.length === 2) {
        const [p1, p2] = g.parentNodes;
        const e1 = edges.find((item) => item.source === p1.id && item.target === child.id);
        if (e1) out.push(routeCoupleEdge(e1, p1, p2, child, busY));
        const e2 = edges.find((item) => item.source === p2.id && item.target === child.id);
        if (e2) out.push(routeCoupleEdge(e2, p2, p1, child, busY));
      } else if (g.parentNodes.length === 1) {
        const parent = g.parentNodes[0];
        const edge = edges.find((item) => item.source === parent.id && item.target === child.id);
        if (edge) out.push(routeSingleParentEdge(edge, parent, child, busY));
      } else {
        g.parentNodes.forEach((parent, index) => {
          const edge = edges.find((item) => item.source === parent.id && item.target === child.id);
          if (edge) out.push(routeLaneEdge(edge, parent, child, index, g.parentNodes.length, busY));
        });
      }
    }
  }

  return out.toSorted((a, b) =>
    a.target.localeCompare(b.target) ||
    a.source.localeCompare(b.source) ||
    a.id.localeCompare(b.id),
  );
}

/**
 * Vertical band for horizontal runs. Keeping the band inside the gutter next
 * to the parent row stops long runs from cutting through intermediate rows
 * when a parent and child sit more than one generation apart.
 */
function laneBand(parentAttachY: number, childAttachY: number, downward: boolean): { low: number; high: number } {
  if (downward) {
    const low = parentAttachY + MIN_ELBOW;
    const high = Math.min(childAttachY - MIN_ELBOW, parentAttachY + GAP_Y - MIN_ELBOW);
    return low <= high ? { low, high } : { low, high: low };
  }
  const high = parentAttachY - MIN_ELBOW;
  const low = Math.max(childAttachY + MIN_ELBOW, parentAttachY - GAP_Y + MIN_ELBOW);
  return low <= high ? { low, high } : { low: high, high };
}

/** True when the child row is not the row directly beside the parent row. */
function skipsRank(parentAttachY: number, childAttachY: number): boolean {
  return Math.abs(childAttachY - parentAttachY) > GAP_Y + 0.5;
}

/**
 * Column gap nearest the parent lane. Card slots repeat on a fixed pitch, so
 * any gap between two slots stays free of cards on every row.
 */
function channelX(child: PlacedNode, laneX: number): number {
  const left = child.x - GAP_X / 2;
  const right = child.x + CARD_W + GAP_X / 2;
  if (child.x <= 0) return right;
  return Math.abs(left - laneX) <= Math.abs(right - laneX) ? left : right;
}

/**
 * Horizontal run and vertical drop from the parent lane to the child edge.
 * Skipped generations detour through a column gap and re-enter the child row
 * through its own gutter, so no segment crosses an intermediate card.
 */
function approachSegments(
  laneX: number,
  laneY: number,
  childX: number,
  childAttachY: number,
  child: PlacedNode,
  downward: boolean,
  skipped: boolean,
): RouteSegment[] {
  if (!skipped) {
    return [
      { x1: laneX, y1: laneY, x2: childX, y2: laneY },
      { x1: childX, y1: laneY, x2: childX, y2: childAttachY },
    ];
  }
  const approachY = downward ? childAttachY - MIN_ELBOW : childAttachY + MIN_ELBOW;
  const channel = channelX(child, laneX);
  return [
    { x1: laneX, y1: laneY, x2: channel, y2: laneY },
    { x1: channel, y1: laneY, x2: channel, y2: approachY },
    { x1: channel, y1: approachY, x2: childX, y2: approachY },
    { x1: childX, y1: approachY, x2: childX, y2: childAttachY },
  ];
}

function routeCoupleEdge(
  edge: RoutingEdge,
  parent: PlacedNode,
  partner: PlacedNode,
  child: PlacedNode,
  busY: number,
): RoutedConnection {
  const isLeft = parent.x <= partner.x;
  const left = isLeft ? parent : partner;
  const right = isLeft ? partner : parent;
  const unionY = centerY(parent);
  const midX = (left.x + CARD_W + right.x) / 2;
  const attachX = isLeft ? left.x + CARD_W : right.x;
  const downward = centerY(child) >= centerY(parent);
  const childAttachY = downward ? child.y : child.y + CARD_H;
  const childX = centerX(child);
  const skipped = skipsRank(downward ? parent.y + CARD_H : parent.y, childAttachY);

  return connection(edge, "parent", [
    { x1: attachX, y1: unionY, x2: midX, y2: unionY },
    { x1: midX, y1: unionY, x2: midX, y2: busY },
    ...approachSegments(midX, busY, childX, childAttachY, child, downward, skipped),
  ], [
    { x: attachX, y: unionY },
    { x: childX, y: childAttachY },
  ]);
}

function routeSingleParentEdge(
  edge: RoutingEdge,
  parent: PlacedNode,
  child: PlacedNode,
  busY: number,
): RoutedConnection {
  const downward = centerY(child) >= centerY(parent);
  const parentAttachY = downward ? parent.y + CARD_H : parent.y;
  const childAttachY = downward ? child.y : child.y + CARD_H;
  const parentX = centerX(parent);
  const childX = centerX(child);
  const skipped = skipsRank(parentAttachY, childAttachY);

  return connection(edge, "parent", [
    { x1: parentX, y1: parentAttachY, x2: parentX, y2: busY },
    ...approachSegments(parentX, busY, childX, childAttachY, child, downward, skipped),
  ], [
    { x: parentX, y: parentAttachY },
    { x: childX, y: childAttachY },
  ]);
}

function routeLaneEdge(
  edge: RoutingEdge,
  parent: PlacedNode,
  child: PlacedNode,
  index: number,
  total: number,
  baseBusY: number,
): RoutedConnection {
  const downward = centerY(child) >= centerY(parent);
  const parentAttachY = downward ? parent.y + CARD_H : parent.y;
  const childAttachY = downward ? child.y : child.y + CARD_H;
  const parentX = centerX(parent);
  const spread = total > 1 ? Math.min(ATTACH_SPREAD, (CARD_W - 24) / (total - 1)) : 0;
  const childX = centerX(child) + (index - (total - 1) / 2) * spread;
  const band = laneBand(parentAttachY, childAttachY, downward);
  const laneY = Math.min(
    Math.max(baseBusY + (index - (total - 1) / 2) * LANE_SPREAD, band.low),
    band.high,
  );
  return connection(edge, "parent", [
    { x1: parentX, y1: parentAttachY, x2: parentX, y2: laneY },
    ...approachSegments(parentX, laneY, childX, childAttachY, child, downward, skipsRank(parentAttachY, childAttachY)),
  ], [
    { x: parentX, y: parentAttachY },
    { x: childX, y: childAttachY },
  ]);
}
