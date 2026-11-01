import type { SubgraphNode, SubgraphEdge, Gender } from '../../lib/types';

export interface LayoutCard {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  generation: number;
  isRoot: boolean;
  isSpouse: boolean;
  branch: 'center' | 'maternal' | 'paternal' | 'children';
  data: {
    given_name_native: string;
    given_name_latin: string;
    full_native: string;
    full_latin: string;
    gender: Gender;
    birth_year_ec?: number | null;
    death_year_ec?: number | null;
    is_deceased: boolean;
  };
}

export interface LayoutUnion {
  id: string;
  partnerAId: string;
  partnerBId: string;
  junctionX: number;
  junctionY: number;
  bridgePath: string;
  status: string;
  unionType?: string;
  isOverpass?: boolean;
}

export interface LayoutConnector {
  id: string;
  type: 'union_bridge' | 'descent_stem' | 'sibling_bus' | 'child_drop';
  path: string;
  relationshipType?: 'BIOLOGICAL' | 'ADOPTIVE' | 'FOSTER';
  unionStatus?: 'ACTIVE' | 'DISSOLVED' | 'WIDOWED';
  unionType?: string;
}

export interface FamilyTreeLayoutResult {
  cards: LayoutCard[];
  unions: LayoutUnion[];
  connectors: LayoutConnector[];
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    width: number;
    height: number;
  };
}

// Geometric Constants
const CARD_WIDTH = 200;
const CARD_HEIGHT = 76;
const H_GAP = 32;          // Clearance between siblings
const SPOUSE_GAP = 56;     // Gap between married / union partners
const V_TIER_GAP = 110;    // Vertical distance between generational levels
const BRANCH_GAP = 72;     // Minimum clearance between maternal and paternal subtrees

function distributeSpouses(allSpouseIds: string[]) {
  const left: string[] = [];
  const right: string[] = [];

  allSpouseIds.forEach((sid, idx) => {
    if (idx === 0) {
      right.push(sid);
    } else if (idx === 1) {
      left.push(sid);
    } else if (idx % 2 === 0) {
      left.unshift(sid);
    } else {
      right.push(sid);
    }
  });

  return { left, right };
}

export function buildFamilyTreeLayout(
  rootId: string,
  nodes: SubgraphNode[],
  edges: SubgraphEdge[]
): FamilyTreeLayoutResult {
  if (nodes.length === 0) {
    return {
      cards: [],
      unions: [],
      connectors: [],
      bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0 },
    };
  }

  // 1. Build adjacency maps
  const nodeMap = new Map<string, SubgraphNode>();
  nodes.forEach((n) => nodeMap.set(n.id, n));

  const parentsOf = new Map<string, string[]>();
  const childrenOf = new Map<string, string[]>();
  const spousesOf = new Map<string, string[]>();

  nodes.forEach((n) => {
    parentsOf.set(n.id, []);
    childrenOf.set(n.id, []);
    spousesOf.set(n.id, []);
  });

  edges.forEach((e) => {
    if (e.label === 'parent') {
      if (nodeMap.has(e.source) && nodeMap.has(e.target)) {
        parentsOf.get(e.target)?.push(e.source);
        childrenOf.get(e.source)?.push(e.target);
      }
    } else if (e.label === 'union') {
      if (nodeMap.has(e.source) && nodeMap.has(e.target)) {
        if (!spousesOf.get(e.source)?.includes(e.target)) {
          spousesOf.get(e.source)?.push(e.target);
        }
        if (!spousesOf.get(e.target)?.includes(e.source)) {
          spousesOf.get(e.target)?.push(e.source);
        }
      }
    }
  });

  // Edge metadata map
  const edgeInfoMap = new Map<
    string,
    {
      relType?: 'BIOLOGICAL' | 'ADOPTIVE' | 'FOSTER';
      unionType?: 'TRADITIONAL' | 'RELIGIOUS' | 'CIVIL';
      status?: 'ACTIVE' | 'DISSOLVED' | 'WIDOWED';
    }
  >();

  edges.forEach((e) => {
    edgeInfoMap.set(`${e.source}->${e.target}`, {
      relType: e.relationship_type,
      unionType: e.union_type,
      status: e.status,
    });
    if (e.label === 'union') {
      edgeInfoMap.set(`${e.target}->${e.source}`, {
        relType: e.relationship_type,
        unionType: e.union_type,
        status: e.status,
      });
    }
  });

  // Ensure root exists
  const rootNode = nodeMap.get(rootId) || nodes[0];
  const effectiveRootId = rootNode.id;

  // 2. Identify genealogical roles around effectiveRootId
  const rootSpouseIds = spousesOf.get(effectiveRootId) || [];
  const primarySpouseId = rootSpouseIds[0];

  // Parents of root
  const rootParentIds = parentsOf.get(effectiveRootId) || [];
  let fatherId: string | undefined;
  let motherId: string | undefined;

  rootParentIds.forEach((pid) => {
    const p = nodeMap.get(pid);
    if (p?.data.gender === 'FEMALE') {
      motherId = pid;
    } else {
      fatherId = pid;
    }
  });

  if (!fatherId && rootParentIds.length > 0) fatherId = rootParentIds[0];
  if (!motherId && rootParentIds.length > 1) motherId = rootParentIds[1];

  // Siblings of root
  const rootSiblingIds = new Set<string>();
  rootParentIds.forEach((pid) => {
    childrenOf.get(pid)?.forEach((cid) => {
      if (cid !== effectiveRootId) rootSiblingIds.add(cid);
    });
  });

  // Children of root across all unions
  const rootChildIds = new Set<string>();
  childrenOf.get(effectiveRootId)?.forEach((cid) => rootChildIds.add(cid));
  rootSpouseIds.forEach((sid) => {
    childrenOf.get(sid)?.forEach((cid) => rootChildIds.add(cid));
  });

  // Check if primarySpouse has in-law parents in graph
  const spouseParentIds = primarySpouseId ? parentsOf.get(primarySpouseId) || [] : [];
  const hasSpouseInLaws = Boolean(primarySpouseId && spouseParentIds.length > 0);

  // 3. Multi-generational BFS to discover relative generation levels
  const genMap = new Map<string, number>();
  genMap.set(effectiveRootId, 0);

  const bfsQueue: string[] = [effectiveRootId];
  while (bfsQueue.length > 0) {
    const current = bfsQueue.shift()!;
    const currentGen = genMap.get(current)!;

    parentsOf.get(current)?.forEach((pid) => {
      if (!genMap.has(pid)) {
        genMap.set(pid, currentGen - 1);
        bfsQueue.push(pid);
      }
    });

    childrenOf.get(current)?.forEach((cid) => {
      if (!genMap.has(cid)) {
        genMap.set(cid, currentGen + 1);
        bfsQueue.push(cid);
      }
    });

    spousesOf.get(current)?.forEach((sid) => {
      if (!genMap.has(sid)) {
        genMap.set(sid, currentGen);
        bfsQueue.push(sid);
      }
    });
  }

  let minGen = 0;
  genMap.forEach((g) => {
    minGen = Math.min(minGen, g);
  });

  const getYForGen = (generation: number) => {
    return (generation - minGen) * (CARD_HEIGHT + V_TIER_GAP);
  };

  // Coordinate Assignment State
  const cardMap = new Map<string, LayoutCard>();
  const layoutCards: LayoutCard[] = [];

  const addCard = (
    id: string,
    x: number,
    generation: number,
    branch: 'center' | 'maternal' | 'paternal' | 'children',
    isRoot = false,
    isSpouse = false
  ) => {
    if (cardMap.has(id)) return;
    const node = nodeMap.get(id);
    if (!node) return;
    const card: LayoutCard = {
      id,
      x,
      y: getYForGen(generation),
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      generation,
      isRoot,
      isSpouse,
      branch,
      data: node.data,
    };
    cardMap.set(id, card);
    layoutCards.push(card);
  };

  const layoutUnions: LayoutUnion[] = [];
  const connectors: LayoutConnector[] = [];
  let overpassCount = 0;

  const processCoupleUnion = (
    unionKey: string,
    partnerAId: string,
    partnerBId: string,
    defaultStatus = 'ACTIVE',
    defaultUnionType = 'TRADITIONAL'
  ) => {
    const cardA = cardMap.get(partnerAId);
    const cardB = cardMap.get(partnerBId);
    if (!cardA || !cardB) return null;

    const leftCard = cardA.x < cardB.x ? cardA : cardB;
    const rightCard = cardA.x < cardB.x ? cardB : cardA;

    const edgeInfo =
      edgeInfoMap.get(`${partnerAId}->${partnerBId}`) ||
      edgeInfoMap.get(`${partnerBId}->${partnerAId}`);
    const status = edgeInfo?.status || defaultStatus;
    const unionType = edgeInfo?.unionType || defaultUnionType;

    // Check if any card lies between leftCard and rightCard on this tier
    const interveningCards = layoutCards.filter(
      (c) =>
        c.generation === leftCard.generation &&
        c.id !== leftCard.id &&
        c.id !== rightCard.id &&
        c.x < rightCard.x &&
        c.x + c.width > leftCard.x + leftCard.width
    );

    let bridgePath = '';
    let junctionX = 0;
    let junctionY = 0;
    let isOverpass = false;

    if (interveningCards.length === 0) {
      // Direct horizontal bridge
      const y = leftCard.y + CARD_HEIGHT / 2;
      const x1 = leftCard.x + CARD_WIDTH;
      const x2 = rightCard.x;
      junctionX = (x1 + x2) / 2;
      junctionY = y;
      bridgePath = `M ${x1} ${y} L ${x2} ${y}`;
    } else {
      // Overpass route: arch ABOVE intermediate cards through the clear tier margin
      isOverpass = true;
      const overpassY = leftCard.y - 18 - overpassCount * 12;
      overpassCount++;

      const exitX = leftCard.x + CARD_WIDTH;
      const enterX = rightCard.x;
      const stepOffset = Math.min(12, Math.max(4, (enterX - exitX) / 8));
      const stepLeft = exitX + stepOffset;
      const stepRight = enterX - stepOffset;
      const y = leftCard.y + CARD_HEIGHT / 2;

      junctionX = (stepLeft + stepRight) / 2;
      junctionY = overpassY;

      bridgePath = `M ${exitX} ${y} H ${stepLeft} V ${overpassY} H ${stepRight} V ${y} L ${enterX} ${y}`;
    }

    connectors.push({
      id: `bridge-${unionKey}`,
      type: 'union_bridge',
      path: bridgePath,
      unionStatus: status as any,
      unionType,
    });

    const unionItem: LayoutUnion = {
      id: unionKey,
      partnerAId,
      partnerBId,
      junctionX,
      junctionY,
      status,
      unionType,
      bridgePath,
      isOverpass,
    };
    layoutUnions.push(unionItem);
    return unionItem;
  };

  const processDescentBranch = (
    descentKey: string,
    junctionX: number,
    junctionY: number,
    childIds: string[]
  ) => {
    const validChildren = childIds
      .map((id) => cardMap.get(id))
      .filter((c): c is LayoutCard => Boolean(c));
    if (validChildren.length === 0) return;

    // Standardize busY: placed 45% of the tier gap below the parent tier bottom
    const firstChild = validChildren[0];
    const parentBottomY = firstChild.y - V_TIER_GAP;
    const busY = parentBottomY + V_TIER_GAP * 0.45;

    const getChildRelType = (childId: string): 'BIOLOGICAL' | 'ADOPTIVE' | 'FOSTER' => {
      const pIds = parentsOf.get(childId) || [];
      for (const pid of pIds) {
        const info = edgeInfoMap.get(`${pid}->${childId}`);
        if (info?.relType && info.relType !== 'BIOLOGICAL') {
          return info.relType;
        }
      }
      return 'BIOLOGICAL';
    };

    if (validChildren.length === 1) {
      const c = validChildren[0];
      const cx = c.x + CARD_WIDTH / 2;
      const cy = c.y;
      const relType = getChildRelType(c.id);

      if (Math.abs(cx - junctionX) < 2) {
        connectors.push({
          id: `drop-${descentKey}-${c.id}`,
          type: 'child_drop',
          path: `M ${junctionX} ${junctionY} L ${cx} ${cy}`,
          relationshipType: relType,
        });
      } else {
        connectors.push({
          id: `drop-${descentKey}-${c.id}`,
          type: 'child_drop',
          path: `M ${junctionX} ${junctionY} V ${busY} H ${cx} V ${cy}`,
          relationshipType: relType,
        });
      }
      return;
    }

    // Stem connects from junction dot down to busY
    connectors.push({
      id: `stem-${descentKey}`,
      type: 'descent_stem',
      path: `M ${junctionX} ${junctionY} L ${junctionX} ${busY}`,
    });

    const childCenters = validChildren.map((c) => c.x + CARD_WIDTH / 2);
    const minX = Math.min(...childCenters, junctionX);
    const maxX = Math.max(...childCenters, junctionX);

    connectors.push({
      id: `bus-${descentKey}`,
      type: 'sibling_bus',
      path: `M ${minX} ${busY} L ${maxX} ${busY}`,
    });

    validChildren.forEach((c) => {
      const cx = c.x + CARD_WIDTH / 2;
      const cy = c.y;
      const relType = getChildRelType(c.id);
      connectors.push({
        id: `drop-${descentKey}-${c.id}`,
        type: 'child_drop',
        path: `M ${cx} ${busY} L ${cx} ${cy}`,
        relationshipType: relType,
      });
    });
  };

  const layoutAncestorsRecursively = (childId: string) => {
    const childCard = cardMap.get(childId);
    if (!childCard) return;

    const pIds = parentsOf.get(childId) || [];
    if (pIds.length === 0) return;

    const parentGen = childCard.generation - 1;

    if (pIds.length === 1) {
      const parentId = pIds[0];
      if (!cardMap.has(parentId)) {
        addCard(parentId, childCard.x, parentGen, childCard.branch);
      }
      const pCard = cardMap.get(parentId);
      if (pCard) {
        const parentBottomY = pCard.y + CARD_HEIGHT;
        const parentCenterX = pCard.x + CARD_WIDTH / 2;
        const childCenterX = childCard.x + CARD_WIDTH / 2;
        const ancBusY = parentBottomY + V_TIER_GAP * 0.45;

        if (Math.abs(parentCenterX - childCenterX) < 2) {
          connectors.push({
            id: `anc-drop-${parentId}-${childId}`,
            type: 'child_drop',
            path: `M ${parentCenterX} ${parentBottomY} L ${childCenterX} ${childCard.y}`,
          });
        } else {
          connectors.push({
            id: `anc-drop-${parentId}-${childId}`,
            type: 'child_drop',
            path: `M ${parentCenterX} ${parentBottomY} V ${ancBusY} H ${childCenterX} V ${childCard.y}`,
          });
        }
        layoutAncestorsRecursively(parentId);
      }
    } else if (pIds.length >= 2) {
      let mId: string | undefined;
      let fId: string | undefined;
      pIds.forEach((pid) => {
        const p = nodeMap.get(pid);
        if (p?.data.gender === 'FEMALE') mId = pid;
        else fId = pid;
      });
      if (!fId) fId = pIds[0];
      if (!mId) mId = pIds[1];

      const coupleW = 2 * CARD_WIDTH + SPOUSE_GAP;
      const childCenterX = childCard.x + CARD_WIDTH / 2;
      const startX = childCenterX - coupleW / 2;

      if (!cardMap.has(mId)) {
        addCard(mId, startX, parentGen, childCard.branch);
      }
      if (!cardMap.has(fId)) {
        addCard(fId, startX + CARD_WIDTH + SPOUSE_GAP, parentGen, childCard.branch);
      }

      const u = processCoupleUnion(`couple-${mId}-${fId}`, mId, fId);
      if (u) {
        const ancBusY = u.junctionY + (childCard.y - u.junctionY) * 0.45;
        if (Math.abs(u.junctionX - childCenterX) < 2) {
          connectors.push({
            id: `anc-stem-${u.id}-${childId}`,
            type: 'child_drop',
            path: `M ${u.junctionX} ${u.junctionY} L ${childCenterX} ${childCard.y}`,
          });
        } else {
          connectors.push({
            id: `anc-stem-${u.id}-${childId}`,
            type: 'child_drop',
            path: `M ${u.junctionX} ${u.junctionY} V ${ancBusY} H ${childCenterX} V ${childCard.y}`,
          });
        }
      }

      layoutAncestorsRecursively(mId);
      layoutAncestorsRecursively(fId);
    }
  };

  interface DescendantBranchNode {
    childId: string;
    spouseId?: string;
    spouseParentIds: string[];
    spouseSiblingIds: string[];
    childrenIds: string[];
    width: number;
    coupleWidth: number;
    spouseGroupWidth: number;
    inLawParentsWidth: number;
    inLawsWidth: number;
    childBranches: DescendantBranchNode[];
  }

  const buildDescendantBranch = (childId: string, visited: Set<string>): DescendantBranchNode => {
    visited.add(childId);

    // Spouse of child not yet visited or placed
    const unplacedSpouseIds = spousesOf.get(childId)?.filter((sid) => !visited.has(sid) && !cardMap.has(sid)) || [];
    const spouseId = unplacedSpouseIds[0];
    if (spouseId) {
      visited.add(spouseId);
    }

    // In-law parents of spouse not yet visited or placed
    const inLawParentIds = spouseId
      ? parentsOf.get(spouseId)?.filter((pid) => !visited.has(pid) && !cardMap.has(pid)) || []
      : [];
    inLawParentIds.forEach((pid) => visited.add(pid));

    // Siblings of spouse (other children of spouseParentIds in subgraph)
    const spouseSiblingSet = new Set<string>();
    if (spouseId && inLawParentIds.length > 0) {
      inLawParentIds.forEach((pid) => {
        childrenOf.get(pid)?.forEach((cid) => {
          if (cid !== spouseId && !visited.has(cid) && !cardMap.has(cid)) {
            spouseSiblingSet.add(cid);
          }
        });
      });
    }
    const spouseSiblingIds = Array.from(spouseSiblingSet);
    spouseSiblingIds.forEach((sid) => visited.add(sid));

    const spouseCount = spouseId ? 1 + spouseSiblingIds.length : 0;
    const spouseGroupWidth =
      spouseCount > 0 ? spouseCount * CARD_WIDTH + (spouseCount - 1) * H_GAP : 0;

    const coupleWidth = spouseId ? CARD_WIDTH + SPOUSE_GAP + spouseGroupWidth : CARD_WIDTH;

    const inLawParentsWidth =
      inLawParentIds.length >= 2
        ? 2 * CARD_WIDTH + SPOUSE_GAP
        : inLawParentIds.length === 1
        ? CARD_WIDTH
        : 0;

    const inLawsWidth = Math.max(inLawParentsWidth, spouseGroupWidth);

    // Children of child (and spouse) not yet visited or placed
    const nextChildrenSet = new Set<string>();
    childrenOf.get(childId)?.forEach((cid) => {
      if (!visited.has(cid) && !cardMap.has(cid)) nextChildrenSet.add(cid);
    });
    if (spouseId) {
      childrenOf.get(spouseId)?.forEach((cid) => {
        if (!visited.has(cid) && !cardMap.has(cid)) nextChildrenSet.add(cid);
      });
    }

    const nextChildren = Array.from(nextChildrenSet);
    const childBranches = nextChildren.map((cid) => buildDescendantBranch(cid, visited));
    const childrenWidth =
      childBranches.length > 0
        ? childBranches.reduce((sum, b) => sum + b.width, 0) + (childBranches.length - 1) * H_GAP
        : 0;

    const width = Math.max(coupleWidth, inLawsWidth, childrenWidth);

    return {
      childId,
      spouseId,
      spouseParentIds: inLawParentIds,
      spouseSiblingIds,
      childrenIds: nextChildren,
      width,
      coupleWidth,
      spouseGroupWidth,
      inLawParentsWidth,
      inLawsWidth,
      childBranches,
    };
  };

  const layoutSingleDescendantBranch = (
    b: DescendantBranchNode,
    branchStartX: number,
    generation: number,
    branchRole: 'center' | 'children' = 'children'
  ) => {
    const coupleStartX = branchStartX + (b.width - b.coupleWidth) / 2;

    // Add child card
    addCard(b.childId, coupleStartX, generation, branchRole);

    // Add spouse card if present
    if (b.spouseId) {
      const spouseStartX = coupleStartX + CARD_WIDTH + SPOUSE_GAP;
      addCard(b.spouseId, spouseStartX, generation, branchRole, false, true);
      const u = processCoupleUnion(`couple-${b.childId}-${b.spouseId}`, b.childId, b.spouseId);

      // Lay out spouse siblings to the right of spouse
      let curSpouseSibX = spouseStartX + CARD_WIDTH + H_GAP;
      b.spouseSiblingIds.forEach((sibId) => {
        addCard(sibId, curSpouseSibX, generation, branchRole);
        curSpouseSibX += CARD_WIDTH + H_GAP;
      });

      // Add spouse parents (in-laws) at (generation - 1)
      const spouseGroupCenter = spouseStartX + b.spouseGroupWidth / 2;
      const allSpouseChildren = [b.spouseId, ...b.spouseSiblingIds];
      let inLawJunctionX = spouseGroupCenter;
      let inLawJunctionY = getYForGen(generation - 1) + CARD_HEIGHT;

      if (b.spouseParentIds.length >= 2) {
        let mId: string | undefined;
        let fId: string | undefined;
        b.spouseParentIds.forEach((pid) => {
          const p = nodeMap.get(pid);
          if (p?.data.gender === 'FEMALE') mId = pid;
          else fId = pid;
        });
        if (!mId) mId = b.spouseParentIds[0];
        if (!fId) fId = b.spouseParentIds[1];

        const inLawParentsStartX = spouseGroupCenter - b.inLawParentsWidth / 2;
        addCard(mId, inLawParentsStartX, generation - 1, branchRole);
        addCard(fId, inLawParentsStartX + CARD_WIDTH + SPOUSE_GAP, generation - 1, branchRole);

        const uInlaws = processCoupleUnion(`inlaws-${mId}-${fId}`, mId, fId);
        if (uInlaws) {
          inLawJunctionX = uInlaws.junctionX;
          inLawJunctionY = uInlaws.junctionY;
        }
        layoutAncestorsRecursively(mId);
        layoutAncestorsRecursively(fId);
      } else if (b.spouseParentIds.length === 1) {
        const singleP = b.spouseParentIds[0];
        const pStartX = spouseGroupCenter - CARD_WIDTH / 2;
        addCard(singleP, pStartX, generation - 1, branchRole);
        const pCard = cardMap.get(singleP);
        if (pCard) {
          inLawJunctionX = pCard.x + CARD_WIDTH / 2;
          inLawJunctionY = pCard.y + CARD_HEIGHT;
        }
        layoutAncestorsRecursively(singleP);
      }

      // Connect in-law parents to spouse + spouse siblings
      if (b.spouseParentIds.length > 0) {
        processDescentBranch(
          `inlaw-branch-${b.childId}`,
          inLawJunctionX,
          inLawJunctionY,
          allSpouseChildren
        );
      }

      // Lay out grandchildren below couple
      if (b.childBranches.length > 0 && u) {
        layoutDescendantBranches(
          b.childBranches,
          u.junctionX,
          u.junctionY,
          generation + 1,
          `descendant-branch-${b.childId}`
        );
      }
    } else {
      // Single parent child with descendants
      if (b.childBranches.length > 0) {
        const cCard = cardMap.get(b.childId);
        const jx = cCard ? cCard.x + CARD_WIDTH / 2 : coupleStartX + CARD_WIDTH / 2;
        const jy = cCard ? cCard.y + CARD_HEIGHT : getYForGen(generation) + CARD_HEIGHT;
        layoutDescendantBranches(
          b.childBranches,
          jx,
          jy,
          generation + 1,
          `descendant-branch-${b.childId}`
        );
      }
    }
  };

  const layoutDescendantBranches = (
    branches: DescendantBranchNode[],
    parentJunctionX: number,
    parentJunctionY: number,
    generation: number,
    parentKey: string
  ) => {
    if (branches.length === 0) return;

    // Arrange branches: branches without in-laws first, branches with in-laws to the right
    // so in-law parents at (generation - 1) can extend upward without colliding with parents/grandparents
    const branchesWithInLaws = branches.filter((b) => b.spouseId && b.spouseParentIds.length > 0);
    const branchesWithoutInLaws = branches.filter((b) => !b.spouseId || b.spouseParentIds.length === 0);
    const orderedBranches = [...branchesWithoutInLaws, ...branchesWithInLaws];

    const totalWidth =
      orderedBranches.reduce((sum, b) => sum + b.width, 0) + (orderedBranches.length - 1) * H_GAP;

    // Check existing card bounds at (generation - 1)
    let minPrevOccX = Infinity;
    let maxPrevOccX = -Infinity;
    cardMap.forEach((c) => {
      if (c.generation === generation - 1) {
        minPrevOccX = Math.min(minPrevOccX, c.x);
        maxPrevOccX = Math.max(maxPrevOccX, c.x + c.width);
      }
    });

    let curX = parentJunctionX - totalWidth / 2;

    orderedBranches.forEach((b) => {
      const hasInLaws = b.spouseId && b.spouseParentIds.length > 0;
      if (hasInLaws && minPrevOccX !== Infinity) {
        // Calculate where in-laws would land at (generation - 1)
        const coupleStartX = curX + (b.width - b.coupleWidth) / 2;
        const spouseStartX = coupleStartX + CARD_WIDTH + SPOUSE_GAP;
        const spouseGroupCenter = spouseStartX + b.spouseGroupWidth / 2;
        const inLawParentsStartX = spouseGroupCenter - b.inLawParentsWidth / 2;

        if (inLawParentsStartX < maxPrevOccX + BRANCH_GAP) {
          const shift = maxPrevOccX + BRANCH_GAP - inLawParentsStartX;
          if (shift > 0) {
            curX += shift;
          }
        }
      }

      layoutSingleDescendantBranch(b, curX, generation, 'children');
      curX += b.width + H_GAP;
    });

    // Connect parent union/stem to this sibling row
    processDescentBranch(
      parentKey,
      parentJunctionX,
      parentJunctionY,
      orderedBranches.map((b) => b.childId)
    );
  };

  const layoutDescendants = (
    childIds: string[],
    parentJunctionX: number,
    parentJunctionY: number,
    generation: number,
    parentKey: string
  ) => {
    const visited = new Set<string>();
    const branches = childIds
      .filter((cid) => nodeMap.has(cid))
      .map((cid) => buildDescendantBranch(cid, visited));
    layoutDescendantBranches(branches, parentJunctionX, parentJunctionY, generation, parentKey);
  };

  // =========================================================================
  // SCENARIO A: DUAL-TREE IN-LAW MODE
  // Triggered when focal person is married and the spouse has parents in subgraph
  // =========================================================================
  if (hasSpouseInLaws && primarySpouseId) {
    // 1. Focal Side (Focal family on the left)
    const focalSiblingsList = Array.from(rootSiblingIds);
    const visitedBranchNodesA = new Set<string>();
    visitedBranchNodesA.add(effectiveRootId);
    if (primarySpouseId) visitedBranchNodesA.add(primarySpouseId);
    rootParentIds.forEach((pid) => visitedBranchNodesA.add(pid));
    spouseParentIds.forEach((pid) => visitedBranchNodesA.add(pid));

    const focalSibBranches = focalSiblingsList.map((id) =>
      buildDescendantBranch(id, visitedBranchNodesA)
    );
    const focalSibsTotalWidth =
      focalSibBranches.reduce((sum, b) => sum + b.width, 0) +
      (focalSibBranches.length > 0 ? focalSibBranches.length * H_GAP : 0) +
      CARD_WIDTH;

    const hasFocalParents = rootParentIds.length > 0;
    const hasBothFocalParents = rootParentIds.length >= 2;
    const focalParentsWidth = hasBothFocalParents
      ? 2 * CARD_WIDTH + SPOUSE_GAP
      : hasFocalParents
      ? CARD_WIDTH
      : 0;

    const focalBranchWidth = Math.max(focalParentsWidth, focalSibsTotalWidth);

    // 2. Spouse Side (Spouse family on the right)
    let spouseMotherId: string | undefined;
    let spouseFatherId: string | undefined;
    spouseParentIds.forEach((pid) => {
      const p = nodeMap.get(pid);
      if (p?.data.gender === 'FEMALE') spouseMotherId = pid;
      else spouseFatherId = pid;
    });
    if (!spouseFatherId && spouseParentIds.length > 0) spouseFatherId = spouseParentIds[0];
    if (!spouseMotherId && spouseParentIds.length > 1) spouseMotherId = spouseParentIds[1];

    const spouseMotherOtherSpouses = spouseMotherId
      ? (spousesOf.get(spouseMotherId) || []).filter((sid) => sid !== spouseFatherId && nodeMap.has(sid))
      : [];
    const spouseFatherOtherSpouses = spouseFatherId
      ? (spousesOf.get(spouseFatherId) || []).filter((sid) => sid !== spouseMotherId && nodeMap.has(sid))
      : [];

    const spouseSiblingIds = new Set<string>();
    spouseParentIds.forEach((pid) => {
      childrenOf.get(pid)?.forEach((cid) => {
        if (cid !== primarySpouseId) spouseSiblingIds.add(cid);
      });
    });
    const spouseSiblingsList = Array.from(spouseSiblingIds);
    const spouseSibBranches = spouseSiblingsList.map((id) =>
      buildDescendantBranch(id, visitedBranchNodesA)
    );
    const spouseSibsTotalWidth =
      CARD_WIDTH +
      (spouseSibBranches.length > 0 ? H_GAP : 0) +
      spouseSibBranches.reduce((sum, b) => sum + b.width, 0) +
      Math.max(0, spouseSibBranches.length - 1) * H_GAP;

    const totalSpouseParentsCount =
      (spouseMotherId ? 1 : 0) +
      (spouseFatherId && spouseFatherId !== spouseMotherId ? 1 : 0) +
      spouseMotherOtherSpouses.length +
      spouseFatherOtherSpouses.length;

    const spouseParentsWidth =
      totalSpouseParentsCount > 0
        ? totalSpouseParentsCount * CARD_WIDTH + (totalSpouseParentsCount - 1) * SPOUSE_GAP
        : 0;

    const spouseBranchWidth = Math.max(spouseParentsWidth, spouseSibsTotalWidth);

    // Clearance between Left (Focal) and Right (Spouse) Subtrees
    const branchSeparationGap = BRANCH_GAP;
    const focalBoxLeft = -focalBranchWidth - branchSeparationGap / 2;
    const spouseBoxLeft = branchSeparationGap / 2;

    // Lay out Focal Parents at Gen -1
    let focalParentsJunctionX = focalBoxLeft + focalBranchWidth / 2;
    let focalParentsJunctionY = getYForGen(-1) + CARD_HEIGHT / 2;
    if (hasBothFocalParents && motherId && fatherId) {
      const pStartX = focalBoxLeft + (focalBranchWidth - focalParentsWidth) / 2;
      addCard(motherId, pStartX, -1, 'paternal');
      addCard(fatherId, pStartX + CARD_WIDTH + SPOUSE_GAP, -1, 'paternal');
      const u = processCoupleUnion('focal-parents', motherId, fatherId);
      if (u) {
        focalParentsJunctionX = u.junctionX;
        focalParentsJunctionY = u.junctionY;
      }
      layoutAncestorsRecursively(motherId);
      layoutAncestorsRecursively(fatherId);
    } else if (hasFocalParents) {
      const singleP = (motherId || fatherId)!;
      const pStartX = focalBoxLeft + (focalBranchWidth - CARD_WIDTH) / 2;
      addCard(singleP, pStartX, -1, 'paternal');
      focalParentsJunctionX = pStartX + CARD_WIDTH / 2;
      const pCard = cardMap.get(singleP);
      if (pCard) focalParentsJunctionY = pCard.y + CARD_HEIGHT;
      layoutAncestorsRecursively(singleP);
    }

    // Lay out Focal Siblings + Focal Root at Gen 0 (Root sits on the far right closest to spouse)
    const focalSibsStartX = focalBoxLeft + (focalBranchWidth - focalSibsTotalWidth) / 2;
    let curFocalX = focalSibsStartX;
    focalSibBranches.forEach((b) => {
      layoutSingleDescendantBranch(b, curFocalX, 0, 'center');
      curFocalX += b.width + H_GAP;
    });
    addCard(effectiveRootId, curFocalX, 0, 'center', true, false);

    // Connect Focal Parents to Focal Sibling Group
    if (hasFocalParents) {
      const allFocalChildren = [...focalSiblingsList, effectiveRootId];
      processDescentBranch('focal-siblings-branch', focalParentsJunctionX, focalParentsJunctionY, allFocalChildren);
    }

    // Lay out Spouse Parents at Gen -1
    let spouseParentsJunctionX = spouseBoxLeft + spouseBranchWidth / 2;
    let spouseParentsJunctionY = getYForGen(-1) + CARD_HEIGHT / 2;

    if (totalSpouseParentsCount > 0) {
      const spStartX = spouseBoxLeft + (spouseBranchWidth - spouseParentsWidth) / 2;
      let curPStartX = spStartX;

      // 1. Mother's other spouses (to the left of mother)
      spouseMotherOtherSpouses.forEach((sid) => {
        addCard(sid, curPStartX, -1, 'maternal', false, true);
        curPStartX += CARD_WIDTH + SPOUSE_GAP;
      });

      // 2. Mother
      if (spouseMotherId) {
        addCard(spouseMotherId, curPStartX, -1, 'maternal');
        curPStartX += CARD_WIDTH + SPOUSE_GAP;
      }

      // 3. Father
      if (spouseFatherId && spouseFatherId !== spouseMotherId) {
        addCard(spouseFatherId, curPStartX, -1, 'maternal');
        curPStartX += CARD_WIDTH + SPOUSE_GAP;
      }

      // 4. Father's other spouses (to the right of father)
      spouseFatherOtherSpouses.forEach((sid) => {
        addCard(sid, curPStartX, -1, 'maternal', false, true);
        curPStartX += CARD_WIDTH + SPOUSE_GAP;
      });

      if (spouseMotherId && spouseFatherId && spouseMotherId !== spouseFatherId) {
        const u = processCoupleUnion('spouse-parents', spouseMotherId, spouseFatherId);
        if (u) {
          spouseParentsJunctionX = u.junctionX;
          spouseParentsJunctionY = u.junctionY;
        }
      } else if (spouseMotherId || spouseFatherId) {
        const singleP = cardMap.get((spouseMotherId || spouseFatherId)!);
        if (singleP) {
          spouseParentsJunctionX = singleP.x + CARD_WIDTH / 2;
          spouseParentsJunctionY = singleP.y + CARD_HEIGHT;
        }
      }

      // Connect secondary unions
      spouseMotherOtherSpouses.forEach((sid) => {
        if (spouseMotherId) processCoupleUnion(`spouse-mom-${sid}`, sid, spouseMotherId);
      });
      spouseFatherOtherSpouses.forEach((sid) => {
        if (spouseFatherId) processCoupleUnion(`spouse-dad-${sid}`, spouseFatherId, sid);
      });

      if (spouseMotherId) layoutAncestorsRecursively(spouseMotherId);
      if (spouseFatherId && spouseFatherId !== spouseMotherId) layoutAncestorsRecursively(spouseFatherId);
    }

    // Lay out Spouse + Spouse Siblings at Gen 0 (Spouse sits on the far left closest to root)
    const spouseSibsStartX = spouseBoxLeft + (spouseBranchWidth - spouseSibsTotalWidth) / 2;
    addCard(primarySpouseId, spouseSibsStartX, 0, 'center', false, true);
    let curSpouseSibX = spouseSibsStartX + CARD_WIDTH + H_GAP;
    spouseSibBranches.forEach((b) => {
      layoutSingleDescendantBranch(b, curSpouseSibX, 0, 'center');
      curSpouseSibX += b.width + H_GAP;
    });

    // Connect Spouse Parents to Spouse Sibling Group
    if (spouseParentIds.length > 0) {
      const allSpouseChildren = [primarySpouseId, ...spouseSiblingsList];
      processDescentBranch('spouse-siblings-branch', spouseParentsJunctionX, spouseParentsJunctionY, allSpouseChildren);
    }

    // Central Union Bridge between Focal Root and Primary Spouse at Gen 0
    const uCentral = processCoupleUnion('root-spouse', effectiveRootId, primarySpouseId);

    // Shared Children at Gen +1
    const childrenList = Array.from(rootChildIds);
    if (childrenList.length > 0) {
      const junctionX = uCentral ? uCentral.junctionX : 0;
      const junctionY = uCentral ? uCentral.junctionY : getYForGen(0) + CARD_HEIGHT;
      layoutDescendants(childrenList, junctionX, junctionY, 1, 'root-children-branch');
    }
  } else {
    // =========================================================================
    // SCENARIO B: FOCAL PEDIGREE MODE
    // Standard view when root is a child or spouse has no in-law parents in graph
    // =========================================================================
    const maternalParentIds = motherId ? parentsOf.get(motherId) || [] : [];
    let maternalGrandpaId: string | undefined;
    let maternalGrandmaId: string | undefined;
    maternalParentIds.forEach((pid) => {
      const p = nodeMap.get(pid);
      if (p?.data.gender === 'FEMALE') maternalGrandmaId = pid;
      else maternalGrandpaId = pid;
    });
    if (!maternalGrandpaId && maternalParentIds.length > 0) maternalGrandpaId = maternalParentIds[0];
    if (!maternalGrandmaId && maternalParentIds.length > 1) maternalGrandmaId = maternalParentIds[1];

    const maternalAuntsUncles = new Set<string>();
    maternalParentIds.forEach((pid) => {
      childrenOf.get(pid)?.forEach((cid) => {
        if (cid !== motherId) maternalAuntsUncles.add(cid);
      });
    });

    const paternalParentIds = fatherId ? parentsOf.get(fatherId) || [] : [];
    let paternalGrandpaId: string | undefined;
    let paternalGrandmaId: string | undefined;
    paternalParentIds.forEach((pid) => {
      const p = nodeMap.get(pid);
      if (p?.data.gender === 'FEMALE') paternalGrandmaId = pid;
      else paternalGrandpaId = pid;
    });
    if (!paternalGrandpaId && paternalParentIds.length > 0) paternalGrandpaId = paternalParentIds[0];
    if (!paternalGrandmaId && paternalParentIds.length > 1) paternalGrandmaId = paternalParentIds[1];

    const paternalAuntsUncles = new Set<string>();
    paternalParentIds.forEach((pid) => {
      childrenOf.get(pid)?.forEach((cid) => {
        if (cid !== fatherId) paternalAuntsUncles.add(cid);
      });
    });

    const hasMaternalGrandparents = Boolean(maternalGrandmaId || maternalGrandpaId);
    const hasBothMaternalGrandparents = Boolean(maternalGrandmaId && maternalGrandpaId);
    const maternalGpWidth = hasBothMaternalGrandparents
      ? 2 * CARD_WIDTH + SPOUSE_GAP
      : hasMaternalGrandparents
      ? CARD_WIDTH
      : 0;

    const maternalSiblingsList = Array.from(maternalAuntsUncles);
    const maternalSiblingsCount = maternalSiblingsList.length + (motherId ? 1 : 0);
    const maternalSiblingsWidth =
      maternalSiblingsCount > 0
        ? maternalSiblingsCount * CARD_WIDTH + (maternalSiblingsCount - 1) * H_GAP
        : 0;

    const maternalBranchWidth = Math.max(maternalGpWidth, maternalSiblingsWidth);

    const hasPaternalGrandparents = Boolean(paternalGrandmaId || paternalGrandpaId);
    const hasBothPaternalGrandparents = Boolean(paternalGrandmaId && paternalGrandpaId);
    const paternalGpWidth = hasBothPaternalGrandparents
      ? 2 * CARD_WIDTH + SPOUSE_GAP
      : hasPaternalGrandparents
      ? CARD_WIDTH
      : 0;

    const paternalSiblingsList = Array.from(paternalAuntsUncles);
    const paternalSiblingsCount = paternalSiblingsList.length + (fatherId ? 1 : 0);
    const paternalSiblingsWidth =
      paternalSiblingsCount > 0
        ? paternalSiblingsCount * CARD_WIDTH + (paternalSiblingsCount - 1) * H_GAP
        : 0;

    const paternalBranchWidth = Math.max(paternalGpWidth, paternalSiblingsWidth);

    let branchSeparationGap = BRANCH_GAP;
    if (motherId && fatherId) {
      const maternalMomOffsetFromRight =
        maternalBranchWidth > maternalSiblingsWidth
          ? (maternalBranchWidth - maternalSiblingsWidth) / 2
          : 0;
      const paternalDadOffsetFromLeft =
        paternalBranchWidth > paternalSiblingsWidth
          ? (paternalBranchWidth - paternalSiblingsWidth) / 2
          : 0;

      const naturalUnionSpan = maternalMomOffsetFromRight + branchSeparationGap + paternalDadOffsetFromLeft;
      if (naturalUnionSpan < SPOUSE_GAP) {
        branchSeparationGap += SPOUSE_GAP - naturalUnionSpan;
      }
    }

    const maternalBoxLeft = -maternalBranchWidth - branchSeparationGap / 2;
    const paternalBoxLeft = branchSeparationGap / 2;

    if (maternalBranchWidth > 0) {
      if (hasBothMaternalGrandparents) {
        const gpStartX = maternalBoxLeft + (maternalBranchWidth - maternalGpWidth) / 2;
        addCard(maternalGrandmaId!, gpStartX, -2, 'maternal');
        addCard(maternalGrandpaId!, gpStartX + CARD_WIDTH + SPOUSE_GAP, -2, 'maternal');
      } else if (hasMaternalGrandparents) {
        const singleId = (maternalGrandmaId || maternalGrandpaId)!;
        const gpStartX = maternalBoxLeft + (maternalBranchWidth - CARD_WIDTH) / 2;
        addCard(singleId, gpStartX, -2, 'maternal');
      }

      if (maternalSiblingsCount > 0) {
        const sibStartX = maternalBoxLeft + (maternalBranchWidth - maternalSiblingsWidth) / 2;
        let curX = sibStartX;
        maternalSiblingsList.forEach((auntUncleId) => {
          addCard(auntUncleId, curX, -1, 'maternal');
          curX += CARD_WIDTH + H_GAP;
        });
        if (motherId) {
          addCard(motherId, curX, -1, 'maternal');
        }
      }
    }

    if (paternalBranchWidth > 0) {
      if (hasBothPaternalGrandparents) {
        const gpStartX = paternalBoxLeft + (paternalBranchWidth - paternalGpWidth) / 2;
        addCard(paternalGrandmaId!, gpStartX, -2, 'paternal');
        addCard(paternalGrandpaId!, gpStartX + CARD_WIDTH + SPOUSE_GAP, -2, 'paternal');
      } else if (hasPaternalGrandparents) {
        const singleId = (paternalGrandmaId || paternalGrandpaId)!;
        const gpStartX = paternalBoxLeft + (paternalBranchWidth - CARD_WIDTH) / 2;
        addCard(singleId, gpStartX, -2, 'paternal');
      }

      if (paternalSiblingsCount > 0) {
        const sibStartX = paternalBoxLeft + (paternalBranchWidth - paternalSiblingsWidth) / 2;
        let curX = sibStartX;
        if (fatherId) {
          addCard(fatherId, curX, -1, 'paternal');
          curX += CARD_WIDTH + H_GAP;
        }
        paternalSiblingsList.forEach((auntUncleId) => {
          addCard(auntUncleId, curX, -1, 'paternal');
          curX += CARD_WIDTH + H_GAP;
        });
      }
    }

    if (motherId && !cardMap.has(motherId) && !fatherId) {
      addCard(motherId, -CARD_WIDTH / 2, -1, 'maternal');
    } else if (fatherId && !cardMap.has(fatherId) && !motherId) {
      addCard(fatherId, -CARD_WIDTH / 2, -1, 'paternal');
    }

    if (maternalGrandmaId) layoutAncestorsRecursively(maternalGrandmaId);
    if (maternalGrandpaId) layoutAncestorsRecursively(maternalGrandpaId);
    if (paternalGrandmaId) layoutAncestorsRecursively(paternalGrandmaId);
    if (paternalGrandpaId) layoutAncestorsRecursively(paternalGrandpaId);

    if (maternalGrandmaId && maternalGrandpaId) {
      const u = processCoupleUnion('maternal-grandparents', maternalGrandmaId, maternalGrandpaId);
      if (u) {
        const allMaternalChildren = [...maternalSiblingsList];
        if (motherId) allMaternalChildren.push(motherId);
        processDescentBranch('maternal-branch', u.junctionX, u.junctionY, allMaternalChildren);
      }
    } else if (hasMaternalGrandparents) {
      const singleGp = cardMap.get((maternalGrandmaId || maternalGrandpaId)!);
      if (singleGp) {
        const allMaternalChildren = [...maternalSiblingsList];
        if (motherId) allMaternalChildren.push(motherId);
        processDescentBranch(
          'maternal-branch',
          singleGp.x + CARD_WIDTH / 2,
          singleGp.y + CARD_HEIGHT,
          allMaternalChildren
        );
      }
    }

    if (paternalGrandmaId && paternalGrandpaId) {
      const u = processCoupleUnion('paternal-grandparents', paternalGrandmaId, paternalGrandpaId);
      if (u) {
        const allPaternalChildren = [fatherId, ...paternalSiblingsList].filter(
          (id): id is string => Boolean(id)
        );
        processDescentBranch('paternal-branch', u.junctionX, u.junctionY, allPaternalChildren);
      }
    } else if (hasPaternalGrandparents) {
      const singleGp = cardMap.get((paternalGrandmaId || paternalGrandpaId)!);
      if (singleGp) {
        const allPaternalChildren = [fatherId, ...paternalSiblingsList].filter(
          (id): id is string => Boolean(id)
        );
        processDescentBranch(
          'paternal-branch',
          singleGp.x + CARD_WIDTH / 2,
          singleGp.y + CARD_HEIGHT,
          allPaternalChildren
        );
      }
    }

    // Determine Parents Junction X
    let parentsJunctionX = 0;
    const momCard = motherId ? cardMap.get(motherId) : undefined;
    const dadCard = fatherId ? cardMap.get(fatherId) : undefined;

    if (momCard && dadCard) {
      parentsJunctionX = (momCard.x + CARD_WIDTH + dadCard.x) / 2;
    } else if (momCard || dadCard) {
      const singleP = (momCard || dadCard)!;
      parentsJunctionX = singleP.x + CARD_WIDTH / 2;
    }

    // Lay Out Tier 0: Focal Root, Primary Spouse, Secondary Spouses, and Siblings
    const focalSiblingsList = Array.from(rootSiblingIds);
    const halfSiblings = Math.floor(focalSiblingsList.length / 2);
    const leftSiblings = focalSiblingsList.slice(0, halfSiblings);
    const rightSiblings = focalSiblingsList.slice(halfSiblings);

    const { left: leftSpouses, right: rightSpouses } = distributeSpouses(rootSpouseIds);
    const spousesCount = leftSpouses.length + rightSpouses.length;
    const focalGroupWidth = (1 + spousesCount) * CARD_WIDTH + spousesCount * SPOUSE_GAP;

    const focalGroupStartX = parentsJunctionX - focalGroupWidth / 2;
    let curGroupX = focalGroupStartX;

    // Lay out left wing spouses
    leftSpouses.forEach((sid) => {
      addCard(sid, curGroupX, 0, 'center', false, true);
      curGroupX += CARD_WIDTH + SPOUSE_GAP;
    });

    // Lay out root
    const rootX = curGroupX;
    addCard(effectiveRootId, rootX, 0, 'center', true, false);
    curGroupX += CARD_WIDTH + SPOUSE_GAP;

    // Lay out right wing spouses
    rightSpouses.forEach((sid) => {
      addCard(sid, curGroupX, 0, 'center', false, true);
      curGroupX += CARD_WIDTH + SPOUSE_GAP;
    });

    // Connect spouses to root
    leftSpouses.forEach((sid) => {
      processCoupleUnion(`root-spouse-${sid}`, sid, effectiveRootId);
    });
    rightSpouses.forEach((sid) => {
      processCoupleUnion(`root-spouse-${sid}`, effectiveRootId, sid);
    });

    const visitedBranchNodesB = new Set<string>();
    visitedBranchNodesB.add(effectiveRootId);
    rootSpouseIds.forEach((sid) => visitedBranchNodesB.add(sid));
    rootParentIds.forEach((pid) => visitedBranchNodesB.add(pid));

    const leftBranches = leftSiblings.map((id) => buildDescendantBranch(id, visitedBranchNodesB));
    const rightBranches = rightSiblings.map((id) => buildDescendantBranch(id, visitedBranchNodesB));

    let curRightBound = focalGroupStartX - H_GAP;
    for (let i = leftBranches.length - 1; i >= 0; i--) {
      const b = leftBranches[i];
      const startX = curRightBound - b.width;
      layoutSingleDescendantBranch(b, startX, 0, 'center');
      curRightBound = startX - H_GAP;
    }

    let curLeftBound = focalGroupStartX + focalGroupWidth + H_GAP;
    rightBranches.forEach((b) => {
      layoutSingleDescendantBranch(b, curLeftBound, 0, 'center');
      curLeftBound += b.width + H_GAP;
    });

    // Connect Parents to Tier 0
    if (momCard && dadCard && motherId && fatherId) {
      const u = processCoupleUnion('root-parents', motherId, fatherId);
      if (u) {
        const allRootSiblings = [...rootSiblingIds, effectiveRootId];
        processDescentBranch('root-siblings-branch', u.junctionX, u.junctionY, allRootSiblings);
      }
    } else if (momCard || dadCard) {
      const singleP = (momCard || dadCard)!;
      const allRootSiblings = [...rootSiblingIds, effectiveRootId];
      processDescentBranch(
        'single-parent-root-branch',
        parentsJunctionX,
        singleP.y + CARD_HEIGHT,
        allRootSiblings
      );
    }

    // Lay Out Tier +1: Children of Root
    const childrenList = Array.from(rootChildIds);
    if (childrenList.length > 0) {
      if (primarySpouseId) {
        const u = layoutUnions.find(
          (union) =>
            (union.partnerAId === effectiveRootId && union.partnerBId === primarySpouseId) ||
            (union.partnerBId === effectiveRootId && union.partnerAId === primarySpouseId)
        ) || processCoupleUnion('root-spouse', effectiveRootId, primarySpouseId);

        const rCard = cardMap.get(effectiveRootId);
        const pCard = cardMap.get(primarySpouseId);
        const jx = u ? u.junctionX : (rCard && pCard ? (rCard.x + pCard.x + CARD_WIDTH) / 2 : 0);
        const jy = u ? u.junctionY : getYForGen(0) + CARD_HEIGHT / 2;
        layoutDescendants(childrenList, jx, jy, 1, 'root-children-branch');
      } else {
        const rCard = cardMap.get(effectiveRootId);
        const jx = rCard ? rCard.x + CARD_WIDTH / 2 : 0;
        const jy = rCard ? rCard.y + CARD_HEIGHT : getYForGen(0) + CARD_HEIGHT;
        layoutDescendants(childrenList, jx, jy, 1, 'root-single-children-branch');
      }
    }
  }

  // Place any remaining unpositioned nodes from subgraph safely to the far right
  let maxPlacedX = -Infinity;
  layoutCards.forEach((c) => {
    maxPlacedX = Math.max(maxPlacedX, c.x + c.width);
  });
  if (maxPlacedX === -Infinity) maxPlacedX = 0;

  let unpositionedOffset = maxPlacedX + BRANCH_GAP;
  nodes.forEach((n) => {
    if (!cardMap.has(n.id)) {
      const g = genMap.get(n.id) ?? 0;
      addCard(n.id, unpositionedOffset, g, 'center');
      unpositionedOffset += CARD_WIDTH + H_GAP;
    }
  });

  // Edge Reconciliation Pass: Ensure every edge between placed cards has a visual connector
  edges.forEach((e) => {
    const cardSrc = cardMap.get(e.source);
    const cardTgt = cardMap.get(e.target);
    if (!cardSrc || !cardTgt) return;

    if (e.label === 'union') {
      const alreadyConnected = layoutUnions.some(
        (u) =>
          (u.partnerAId === e.source && u.partnerBId === e.target) ||
          (u.partnerAId === e.target && u.partnerBId === e.source)
      );
      if (!alreadyConnected) {
        processCoupleUnion(`union-rec-${e.id || `${e.source}-${e.target}`}`, e.source, e.target);
      }
    } else if (e.label === 'parent') {
      const childCenterX = cardTgt.x + CARD_WIDTH / 2;
      const childTopY = cardTgt.y;
      const hasDrop = connectors.some((c) => {
        return c.id.includes(e.target) || c.path.includes(`L ${childCenterX} ${childTopY}`);
      });

      if (!hasDrop) {
        const parentCenterX = cardSrc.x + CARD_WIDTH / 2;
        const parentBottomY = cardSrc.y + CARD_HEIGHT;
        const midY = (parentBottomY + childTopY) / 2;

        let pathStr = '';
        if (Math.abs(parentCenterX - childCenterX) < 2) {
          pathStr = `M ${parentCenterX} ${parentBottomY} L ${childCenterX} ${childTopY}`;
        } else {
          pathStr = `M ${parentCenterX} ${parentBottomY} V ${midY} H ${childCenterX} V ${childTopY}`;
        }

        connectors.push({
          id: `rec-drop-${e.id || `${e.source}-${e.target}`}`,
          type: 'child_drop',
          path: pathStr,
          relationshipType: e.relationship_type || 'BIOLOGICAL',
        });
      }
    }
  });

  // Calculate Layout Bounds
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  layoutCards.forEach((c) => {
    minX = Math.min(minX, c.x);
    maxX = Math.max(maxX, c.x + c.width);
    minY = Math.min(minY, c.y);
    maxY = Math.max(maxY, c.y + c.height);
  });

  layoutUnions.forEach((u) => {
    if (u.isOverpass) {
      minY = Math.min(minY, u.junctionY - 12);
    }
  });

  if (layoutCards.length === 0) {
    minX = 0;
    maxX = 0;
    minY = 0;
    maxY = 0;
  }

  return {
    cards: layoutCards,
    unions: layoutUnions,
    connectors,
    bounds: {
      minX,
      maxX,
      minY,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
    },
  };
}
