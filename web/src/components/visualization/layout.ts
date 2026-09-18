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
export const CARD_H = 80;
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
  const ids = nodes.map((n) => n.id).toSorted((a, b) => a.localeCompare(b));
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
  const normalizedUnions = unions
    .map((e) => [e.source, e.target].toSorted((a, b) => a.localeCompare(b)))
    .toSorted((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));

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

  // Union partners share the deeper rank until stable.
  let rankChanged = true;
  while (rankChanged) {
    rankChanged = false;
    for (const [a, b] of normalizedUnions) {
      if (!ids.includes(a) || !ids.includes(b)) continue;
      const ra = ranks.get(a) ?? 0;
      const rb = ranks.get(b) ?? 0;
      if (ra !== rb) {
        const shared = Math.max(ra, rb);
        ranks.set(a, shared);
        ranks.set(b, shared);
        rankChanged = true;
      }
    }
  }

  // Order slots per rank. Partners form connected union chains so shared
  // partners sit between their spouses and all possible unions are adjacent.
  const byRank = new Map<number, string[][]>();
  const maxRank = Math.max(0, ...ranks.values());
  for (let r = 0; r <= maxRank; r++) {
    const rankIds = ids.filter((id) => ranks.get(id) === r);
    const neighbors = new Map<string, string[]>();
    for (const id of rankIds) neighbors.set(id, []);
    for (const [a, b] of normalizedUnions) {
      if (ranks.get(a) === r && ranks.get(b) === r) {
        neighbors.get(a)?.push(b);
        neighbors.get(b)?.push(a);
      }
    }
    for (const list of neighbors.values()) {
      list.sort((a, b) => a.localeCompare(b));
    }

    const units: string[][] = [];
    const visited = new Set<string>();
    for (const id of rankIds) {
      if (visited.has(id)) continue;
      const component: string[] = [];
      const queue = [id];
      visited.add(id);
      while (queue.length > 0) {
        const curr = queue.shift()!;
        component.push(curr);
        for (const n of neighbors.get(curr) ?? []) {
          if (!visited.has(n)) {
            visited.add(n);
            queue.push(n);
          }
        }
      }

      if (component.length <= 1) {
        units.push(component);
        continue;
      }

      // Order component as a path starting from a leaf (degree <= 1).
      const sortedComp = component.toSorted((a, b) => {
        const degA = neighbors.get(a)?.length ?? 0;
        const degB = neighbors.get(b)?.length ?? 0;
        return degA - degB || a.localeCompare(b);
      });
      const start = sortedComp[0];
      const chain = [start];
      const inChain = new Set<string>([start]);
      let head = start;
      while (chain.length < component.length) {
        const next = (neighbors.get(head) ?? []).find((n) => !inChain.has(n));
        if (next) {
          chain.push(next);
          inChain.add(next);
          head = next;
        } else {
          const remaining = sortedComp.find((n) => !inChain.has(n));
          if (!remaining) break;
          chain.push(remaining);
          inChain.add(remaining);
          head = remaining;
        }
      }
      units.push(chain);
    }
    byRank.set(r, units);
  }

  const slotOf = (id: string): number => {
    const units = byRank.get(ranks.get(id) ?? 0) ?? [];
    let slot = 0;
    for (const unit of units) {
      for (const member of unit) {
        if (member === id) return slot;
        slot++;
      }
    }
    return 0;
  };

  for (let pass = 0; pass < 2; pass++) {
    // Downward: position children under their parents
    for (let r = 1; r <= maxRank; r++) {
      const units = byRank.get(r) ?? [];
      const scored = units.map((unit) => {
        const parentIds = unit.flatMap((id) => parentsOf.get(id) ?? []);
        if (parentIds.length === 0) return { unit, score: slotOf(unit[0]) };
        const mean = parentIds.reduce((s, p) => s + slotOf(p), 0) / parentIds.length;
        return { unit, score: mean };
      });
      scored.sort((a, b) => a.score - b.score || slotOf(a.unit[0]) - slotOf(b.unit[0]));
      byRank.set(
        r,
        scored.map((s) => s.unit),
      );
    }
    // Upward: position parents over their children
    for (let r = maxRank - 1; r >= 0; r--) {
      const units = byRank.get(r) ?? [];
      const scored = units.map((unit) => {
        const kids = unit.flatMap((id) => childrenOf.get(id) ?? []);
        if (kids.length === 0) return { unit, score: slotOf(unit[0]) };
        const mean = kids.reduce((s, k) => s + slotOf(k), 0) / kids.length;
        return { unit, score: mean };
      });
      scored.sort((a, b) => a.score - b.score || slotOf(a.unit[0]) - slotOf(b.unit[0]));
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
