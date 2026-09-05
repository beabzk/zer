export interface LayoutNode {
  id: string;
}

export interface LayoutEdge {
  source: string;
  target: string;
}

export interface PlacedNode extends LayoutNode {
  x: number;
  y: number;
  rank: number;
}

export const CARD_W = 176;
export const CARD_H = 64;
export const GAP_X = 32;
export const GAP_Y = 72;

/**
 * Layered family layout. Generations form ranks computed from the longest
 * parent chain, union partners share a rank and sit adjacent, children
 * center under their parents through barycenter passes.
 */
export function layoutGraph(
  nodes: LayoutNode[],
  parents: LayoutEdge[],
  unions: LayoutEdge[],
): PlacedNode[] {
  const ids = nodes.map((n) => n.id);
  const childrenOf = new Map<string, string[]>();
  const parentsOf = new Map<string, string[]>();
  for (const id of ids) {
    childrenOf.set(id, []);
    parentsOf.set(id, []);
  }
  for (const e of parents) {
    if (childrenOf.has(e.source) && parentsOf.has(e.target)) {
      childrenOf.get(e.source)!.push(e.target);
      parentsOf.get(e.target)!.push(e.source);
    }
  }
  const partnerOf = new Map<string, string>();
  for (const e of unions) {
    if (ids.includes(e.source) && ids.includes(e.target)) {
      partnerOf.set(e.source, e.target);
      partnerOf.set(e.target, e.source);
    }
  }

  // Rank by longest parent chain, memoized over the DAG.
  const rankMemo = new Map<string, number>();
  const visiting = new Set<string>();
  const rankOf = (id: string): number => {
    const hit = rankMemo.get(id);
    if (hit !== undefined) return hit;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    let rank = 0;
    for (const p of parentsOf.get(id) ?? []) {
      rank = Math.max(rank, rankOf(p) + 1);
    }
    visiting.delete(id);
    rankMemo.set(id, rank);
    return rank;
  };
  const ranks = new Map(ids.map((id) => [id, rankOf(id)] as [string, number]));

  // Union partners share the deeper rank.
  for (const [a, b] of partnerOf) {
    const shared = Math.max(ranks.get(a) ?? 0, ranks.get(b) ?? 0);
    ranks.set(a, shared);
    ranks.set(b, shared);
  }

  // Order slots per rank. Partners form one unit occupying two slots.
  const byRank = new Map<number, string[][]>();
  const placedUnit = new Set<string>();
  const maxRank = Math.max(0, ...ranks.values());
  for (let r = 0; r <= maxRank; r++) {
    const units: string[][] = [];
    for (const id of ids) {
      if (ranks.get(id) !== r || placedUnit.has(id)) continue;
      const partner = partnerOf.get(id);
      if (partner && ranks.get(partner) === r && !placedUnit.has(partner)) {
        units.push([id, partner]);
        placedUnit.add(id);
        placedUnit.add(partner);
      } else {
        units.push([id]);
        placedUnit.add(id);
      }
    }
    byRank.set(r, units);
  }

  // Seed order by first appearance, then barycenter children under parents.
  const order = new Map<string, number>();
  for (const [, units] of byRank) {
    units.forEach((unit, i) => unit.forEach((id) => order.set(id, i)));
  }
  const unitIndex = (id: string): number => {
    const units = byRank.get(ranks.get(id) ?? 0) ?? [];
    const i = units.findIndex((u) => u.includes(id));
    return i < 0 ? 0 : i;
  };
  for (let pass = 0; pass < 2; pass++) {
    for (let r = maxRank; r >= 0; r--) {
      const units = byRank.get(r) ?? [];
      const scored = units.map((unit) => {
        const kids = unit.flatMap((id) => childrenOf.get(id) ?? []);
        if (kids.length === 0) return { unit, score: unitIndex(unit[0]) };
        const mean = kids.reduce((s, k) => s + unitIndex(k), 0) / kids.length;
        return { unit, score: mean };
      });
      scored.sort((a, b) => a.score - b.score);
      byRank.set(
        r,
        scored.map((s) => s.unit),
      );
    }
  }

  const out: PlacedNode[] = [];
  for (const [r, units] of byRank) {
    let slot = 0;
    for (const unit of units) {
      for (const id of unit) {
        out.push({
          id,
          x: slot * (CARD_W + GAP_X),
          y: r * (CARD_H + GAP_Y),
          rank: r,
        });
        slot++;
      }
    }
  }
  return out;
}
