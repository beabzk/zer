import type { LineageNode } from "../../lib/types";

export interface LineageLayoutConfig {
  cardWidth?: number;
  cardHeight?: number;
  colGap?: number;
  rowGap?: number;
  paddingX?: number;
  paddingY?: number;
}

export interface LineageLayoutNode {
  key: string;
  node: LineageNode;
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
  isRoot: boolean;
  parentId?: string;
}

export interface LineageConnector {
  id: string;
  sourceKey: string;
  targetKey: string;
  path: string;
}

export interface LineageTierHeader {
  depth: number;
  x: number;
  width: number;
  count: number;
}

export interface LineageLayoutResult {
  nodes: LineageLayoutNode[];
  connectors: LineageConnector[];
  tierHeaders: LineageTierHeader[];
  width: number;
  height: number;
}

interface TreeNodeInternal {
  key: string;
  node: LineageNode;
  depth: number;
  isRoot: boolean;
  parentKey?: string;
  children: TreeNodeInternal[];
  x: number;
  y: number;
}

export function buildLineageTreeLayout(
  nodes: LineageNode[],
  direction: "ancestors" | "descendants" = "ancestors",
  config: LineageLayoutConfig = {},
): LineageLayoutResult {
  const cardWidth = config.cardWidth ?? 220;
  const cardHeight = config.cardHeight ?? 84;
  const colGap = config.colGap ?? 56;
  const rowGap = config.rowGap ?? 18;
  const paddingX = config.paddingX ?? 24;
  const paddingY = config.paddingY ?? 32;

  if (nodes.length === 0) {
    return {
      nodes: [],
      connectors: [],
      tierHeaders: [],
      width: 0,
      height: 0,
    };
  }

  // 1. Build lookup and tree hierarchy based on node.path
  const internalMap = new Map<string, TreeNodeInternal>();

  nodes.forEach((n) => {
    const key = n.path.join("/");
    const parentKey = n.path.length > 1 ? n.path.slice(0, -1).join("/") : undefined;
    internalMap.set(key, {
      key,
      node: n,
      depth: n.depth,
      isRoot: n.depth === 0,
      parentKey,
      children: [],
      x: 0,
      y: 0,
    });
  });

  // Attach children to their parent
  const rootNodes: TreeNodeInternal[] = [];
  internalMap.forEach((item) => {
    if (item.parentKey && internalMap.has(item.parentKey)) {
      internalMap.get(item.parentKey)!.children.push(item);
    } else {
      rootNodes.push(item);
    }
  });

  // 2. Sort children consistently
  // For ancestors: Males (father line) first on top, Females (mother line) bottom
  // For descendants: Sort by birth year ascending
  internalMap.forEach((item) => {
    if (direction === "ancestors") {
      item.children.sort((a, b) => {
        if (a.node.gender === "MALE" && b.node.gender !== "MALE") return -1;
        if (a.node.gender !== "MALE" && b.node.gender === "MALE") return 1;
        return a.node.full_native.localeCompare(b.node.full_native);
      });
    } else {
      item.children.sort((a, b) => {
        const yearA = a.node.birth_year_ec ?? 9999;
        const yearB = b.node.birth_year_ec ?? 9999;
        return yearA - yearB;
      });
    }
  });

  // 3. Post-order traversal to compute Y coordinates:
  // Leaves are allocated row slots in order, and parents center between their children.
  let currentLeafY = paddingY;

  function layoutSubtreeY(curr: TreeNodeInternal) {
    if (curr.children.length === 0) {
      curr.y = currentLeafY;
      currentLeafY += cardHeight + rowGap;
    } else {
      curr.children.forEach((c) => layoutSubtreeY(c));
      const firstChild = curr.children[0];
      const lastChild = curr.children[curr.children.length - 1];
      curr.y = (firstChild.y + lastChild.y) / 2;
    }
  }

  rootNodes.forEach((root) => layoutSubtreeY(root));

  // 4. Compute X coordinates from depth
  let maxDepth = 0;
  let maxY = currentLeafY;

  internalMap.forEach((item) => {
    item.x = paddingX + item.depth * (cardWidth + colGap);
    if (item.depth > maxDepth) maxDepth = item.depth;
    if (item.y + cardHeight > maxY) maxY = item.y + cardHeight;
  });

  const totalWidth = paddingX + (maxDepth + 1) * cardWidth + maxDepth * colGap + paddingX;
  const totalHeight = Math.max(maxY + paddingY, 320);

  // 5. Generate smooth orthogonal branch connectors
  const connectors: LineageConnector[] = [];
  const radius = 6;

  internalMap.forEach((item) => {
    if (item.children.length > 0) {
      const startX = item.x + cardWidth;
      const startY = item.y + cardHeight / 2;
      const midX = item.x + cardWidth + colGap / 2;

      item.children.forEach((child) => {
        const endX = child.x;
        const endY = child.y + cardHeight / 2;
        const dy = endY - startY;

        let path = "";
        if (Math.abs(dy) < 1) {
          // Direct straight horizontal line
          path = `M ${startX} ${startY} L ${endX} ${endY}`;
        } else if (dy > 0) {
          // Branching down
          const r = Math.min(radius, colGap / 4, dy / 2);
          path = [
            `M ${startX} ${startY}`,
            `L ${midX - r} ${startY}`,
            `Q ${midX} ${startY} ${midX} ${startY + r}`,
            `L ${midX} ${endY - r}`,
            `Q ${midX} ${endY} ${midX + r} ${endY}`,
            `L ${endX} ${endY}`,
          ].join(" ");
        } else {
          // Branching up
          const r = Math.min(radius, colGap / 4, -dy / 2);
          path = [
            `M ${startX} ${startY}`,
            `L ${midX - r} ${startY}`,
            `Q ${midX} ${startY} ${midX} ${startY - r}`,
            `L ${midX} ${endY + r}`,
            `Q ${midX} ${endY} ${midX + r} ${endY}`,
            `L ${endX} ${endY}`,
          ].join(" ");
        }

        connectors.push({
          id: `conn-${item.key}->${child.key}`,
          sourceKey: item.key,
          targetKey: child.key,
          path,
        });
      });
    }
  });

  // 6. Tier headers per depth level
  const tierCounts = new Map<number, number>();
  internalMap.forEach((item) => {
    tierCounts.set(item.depth, (tierCounts.get(item.depth) ?? 0) + 1);
  });

  const tierHeaders: LineageTierHeader[] = [];
  for (let d = 0; d <= maxDepth; d++) {
    tierHeaders.push({
      depth: d,
      x: paddingX + d * (cardWidth + colGap),
      width: cardWidth,
      count: tierCounts.get(d) ?? 0,
    });
  }

  // 7. Flatten layout nodes
  const layoutNodes: LineageLayoutNode[] = Array.from(internalMap.values()).map((item) => ({
    key: item.key,
    node: item.node,
    x: item.x,
    y: item.y,
    width: cardWidth,
    height: cardHeight,
    depth: item.depth,
    isRoot: item.isRoot,
    parentId: item.parentKey,
  }));

  return {
    nodes: layoutNodes,
    connectors,
    tierHeaders,
    width: totalWidth,
    height: totalHeight,
  };
}
