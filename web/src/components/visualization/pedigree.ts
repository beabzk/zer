import type { LineageNode, LineageUnion } from "../../lib/api";
import { CARD_H, CARD_W, GAP_X, GAP_Y } from "./layout";
import type { RouteSegment } from "./routing";

const NUL = "\u0000";

/** Occurrence key. A person reached through several paths occupies several
  cards, so the path, never the person id, identifies a card. */
export function pathKey(path: string[]): string {
  return path.join(NUL);
}

export interface PedigreeCard {
  key: string;
  id: string;
  depth: number;
  path: string[];
  row: number;
  x: number;
  y: number;
}

export interface PedigreeLink {
  key: string;
  /** Occurrence keys, ordered top to bottom for branches and left to right
    for partner links. */
  from: string;
  to: string;
  segments: RouteSegment[];
}

export interface PedigreeLayout {
  cards: PedigreeCard[];
  branches: PedigreeLink[];
  partners: PedigreeLink[];
  width: number;
  height: number;
}

export const PEDIGREE_COL_W = CARD_W + GAP_X;
export const PEDIGREE_ROW_H = CARD_H + GAP_Y;

/**
 * Branch layout for one lineage direction. Each occurrence hangs off the
 * occurrence formed by dropping the last step of its path, so ancestors fan
 * upward and descendants fan downward. Leaves take the next column and
 * parents center over their children, which keeps each subtree inside a
 * contiguous band and stops subtrees from overlapping.
 */
export function layoutPedigree(
  nodes: LineageNode[],
  unions: LineageUnion[],
  direction: "ancestors" | "descendants",
): PedigreeLayout {
  const maxDepth = nodes.reduce((max, node) => Math.max(max, node.depth), 0);
  const cards: PedigreeCard[] = nodes.map((node) => {
    const row = direction === "ancestors" ? maxDepth - node.depth : node.depth;
    return {
      key: pathKey(node.path),
      id: node.id,
      depth: node.depth,
      path: node.path,
      row,
      x: 0,
      y: row * PEDIGREE_ROW_H,
    };
  });
  const byKey = new Map(cards.map((card) => [card.key, card]));
  const childrenOf = new Map<string, string[]>();
  const roots: string[] = [];
  for (const card of cards) {
    const parentKey = card.path.length > 1 ? pathKey(card.path.slice(0, -1)) : "";
    const parent = parentKey ? byKey.get(parentKey) : undefined;
    if (!parent) {
      roots.push(card.key);
      continue;
    }
    const siblings = childrenOf.get(parent.key) ?? [];
    siblings.push(card.key);
    childrenOf.set(parent.key, siblings);
  }

  let nextSlot = 0;
  const assign = (key: string): number => {
    const card = byKey.get(key);
    if (!card) return 0;
    const children = childrenOf.get(key) ?? [];
    const slot = children.length === 0
      ? nextSlot++
      : children.map(assign).reduce((sum, value) => sum + value, 0) / children.length;
    card.x = slot * PEDIGREE_COL_W;
    return slot;
  };
  for (const key of roots) assign(key);

  const branches: PedigreeLink[] = [];
  for (const card of cards) {
    if (card.path.length <= 1) continue;
    const parent = byKey.get(pathKey(card.path.slice(0, -1)));
    if (!parent) continue;
    const [top, bottom] = parent.row <= card.row ? [parent, card] : [card, parent];
    branches.push({
      key: `${top.key}${NUL}${bottom.key}`,
      from: top.key,
      to: bottom.key,
      segments: branchSegments(top, bottom),
    });
  }

  const partners: PedigreeLink[] = [];
  for (const union of unions) {
    for (const left of cards.filter((card) => card.id === union.source)) {
      for (const right of cards.filter((card) => card.id === union.target)) {
        if (left.row !== right.row) continue;
        const [first, second] = left.x <= right.x ? [left, right] : [right, left];
        // Only neighbours can be joined without a segment crossing a card.
        if (Math.abs(second.x - first.x - PEDIGREE_COL_W) > 0.5) continue;
        partners.push({
          key: `${union.id}${NUL}${first.key}${NUL}${second.key}`,
          from: first.key,
          to: second.key,
          segments: [
            {
              x1: first.x + CARD_W,
              y1: first.y + CARD_H / 2,
              x2: second.x,
              y2: second.y + CARD_H / 2,
            },
          ],
        });
      }
    }
  }

  const width = cards.reduce((max, card) => Math.max(max, card.x + CARD_W), 0);
  const height = cards.reduce((max, card) => Math.max(max, card.y + CARD_H), 0);
  return { cards, branches, partners, width, height };
}

/** Orthogonal elbow between two stacked cards, straight when already aligned. */
function branchSegments(top: PedigreeCard, bottom: PedigreeCard): RouteSegment[] {
  const x1 = top.x + CARD_W / 2;
  const y1 = top.y + CARD_H;
  const x2 = bottom.x + CARD_W / 2;
  const y2 = bottom.y;
  if (x1 === x2) return [{ x1, y1, x2, y2 }];
  const midY = y1 + (y2 - y1) / 2;
  return [
    { x1, y1, x2: x1, y2: midY },
    { x1, y1: midY, x2, y2: midY },
    { x1: x2, y1: midY, x2, y2 },
  ];
}
