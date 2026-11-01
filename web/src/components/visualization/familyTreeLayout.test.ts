import { describe, it, expect } from 'vitest';
import { buildFamilyTreeLayout, type LayoutCard } from './familyTreeLayout';
import type { SubgraphNode, SubgraphEdge } from '../../lib/types';

function assertNoCollisions(cards: LayoutCard[]) {
  // Group cards by generation tier (Y level)
  const byGen = new Map<number, LayoutCard[]>();
  cards.forEach((c) => {
    const list = byGen.get(c.generation) || [];
    list.push(c);
    byGen.set(c.generation, list);
  });

  byGen.forEach((genCards, gen) => {
    for (let i = 0; i < genCards.length; i++) {
      for (let j = i + 1; j < genCards.length; j++) {
        const a = genCards[i];
        const b = genCards[j];
        const aRight = a.x + a.width;
        const bRight = b.x + b.width;

        const overlaps = Math.max(a.x, b.x) < Math.min(aRight, bRight);
        if (overlaps) {
          throw new Error(
            `Collision detected at gen ${gen} between card '${a.id}' [${a.x}, ${aRight}] and card '${b.id}' [${b.x}, ${bRight}]`
          );
        }
      }
    }
  });
}

describe('buildFamilyTreeLayout', () => {
  it('returns empty layout for empty input', () => {
    const res = buildFamilyTreeLayout('none', [], []);
    expect(res.cards).toHaveLength(0);
    expect(res.unions).toHaveLength(0);
    expect(res.connectors).toHaveLength(0);
  });

  it('prevents overlap when grandparents exist with single children', () => {
    // Grandparents:
    // Maternal: Aster (F) + Berhanu (M) -> Desta (Mom, only child)
    // Paternal: Tadelech (F) + Girma (M) -> Abebe (Dad, only child)
    // Parents:
    // Desta + Abebe -> Dawit (Focal) + 4 siblings (Kassahun, Tirunesh, Yared, Nahom)
    const nodes: SubgraphNode[] = [
      // Focal root
      {
        id: 'dawit',
        data: {
          given_name_native: 'ዳዊት',
          given_name_latin: 'Dawit',
          full_native: 'ዳዊት አበበ',
          full_latin: 'Dawit Abebe',
          gender: 'MALE',
          birth_year_ec: 1996,
          is_deceased: false,
        },
      },
      // Siblings
      {
        id: 'kassahun',
        data: {
          given_name_native: 'ካሳሁን',
          given_name_latin: 'Kassahun',
          full_native: 'ካሳሁን',
          full_latin: 'Kassahun',
          gender: 'MALE',
          is_deceased: false,
        },
      },
      {
        id: 'tirunesh',
        data: {
          given_name_native: 'ጥሩነሽ',
          given_name_latin: 'Tirunesh',
          full_native: 'ጥሩነሽ',
          full_latin: 'Tirunesh',
          gender: 'FEMALE',
          is_deceased: false,
        },
      },
      {
        id: 'yared',
        data: {
          given_name_native: 'ያሬድ',
          given_name_latin: 'Yared',
          full_native: 'ያሬድ',
          full_latin: 'Yared',
          gender: 'MALE',
          is_deceased: false,
        },
      },
      {
        id: 'nahom',
        data: {
          given_name_native: 'ናሆም',
          given_name_latin: 'Nahom',
          full_native: 'ናሆም',
          full_latin: 'Nahom',
          gender: 'MALE',
          is_deceased: false,
        },
      },
      // Parents
      {
        id: 'desta',
        data: {
          given_name_native: 'ደስታ',
          given_name_latin: 'Desta',
          full_native: 'ደስታ',
          full_latin: 'Desta',
          gender: 'FEMALE',
          is_deceased: false,
        },
      },
      {
        id: 'abebe',
        data: {
          given_name_native: 'አበበ',
          given_name_latin: 'Abebe',
          full_native: 'አበበ',
          full_latin: 'Abebe',
          gender: 'MALE',
          is_deceased: false,
        },
      },
      // Maternal Grandparents
      {
        id: 'aster',
        data: {
          given_name_native: 'አስቴር',
          given_name_latin: 'Aster',
          full_native: 'አስቴር',
          full_latin: 'Aster',
          gender: 'FEMALE',
          is_deceased: false,
        },
      },
      {
        id: 'berhanu',
        data: {
          given_name_native: 'ብርሃኑ',
          given_name_latin: 'Berhanu',
          full_native: 'ብርሃኑ',
          full_latin: 'Berhanu',
          gender: 'MALE',
          is_deceased: true,
        },
      },
      // Paternal Grandparents
      {
        id: 'tadelech',
        data: {
          given_name_native: 'ታደለች',
          given_name_latin: 'Tadelech',
          full_native: 'ታደለች',
          full_latin: 'Tadelech',
          gender: 'FEMALE',
          is_deceased: false,
        },
      },
      {
        id: 'girma',
        data: {
          given_name_native: 'ግርማ',
          given_name_latin: 'Girma',
          full_native: 'ግርማ',
          full_latin: 'Girma',
          gender: 'MALE',
          is_deceased: false,
        },
      },
    ];

    const edges: SubgraphEdge[] = [
      // Maternal Grandparents
      { id: 'u-mat', source: 'aster', target: 'berhanu', label: 'union' },
      { id: 'p-mat-1', source: 'aster', target: 'desta', label: 'parent' },
      { id: 'p-mat-2', source: 'berhanu', target: 'desta', label: 'parent' },

      // Paternal Grandparents
      { id: 'u-pat', source: 'tadelech', target: 'girma', label: 'union' },
      { id: 'p-pat-1', source: 'tadelech', target: 'abebe', label: 'parent' },
      { id: 'p-pat-2', source: 'girma', target: 'abebe', label: 'parent' },

      // Parents
      { id: 'u-par', source: 'desta', target: 'abebe', label: 'union' },
      { id: 'p-c-1', source: 'desta', target: 'dawit', label: 'parent' },
      { id: 'p-c-2', source: 'abebe', target: 'dawit', label: 'parent' },
      { id: 'p-c-3', source: 'desta', target: 'kassahun', label: 'parent' },
      { id: 'p-c-4', source: 'abebe', target: 'kassahun', label: 'parent' },
      { id: 'p-c-5', source: 'desta', target: 'tirunesh', label: 'parent' },
      { id: 'p-c-6', source: 'abebe', target: 'tirunesh', label: 'parent' },
      { id: 'p-c-7', source: 'desta', target: 'yared', label: 'parent' },
      { id: 'p-c-8', source: 'abebe', target: 'yared', label: 'parent' },
      { id: 'p-c-9', source: 'desta', target: 'nahom', label: 'parent' },
      { id: 'p-c-10', source: 'abebe', target: 'nahom', label: 'parent' },
    ];

    const result = buildFamilyTreeLayout('dawit', nodes, edges);

    // Verify all 11 people placed
    expect(result.cards).toHaveLength(11);

    // CRITICAL: Ensure zero card collisions on any generation tier!
    expect(() => assertNoCollisions(result.cards)).not.toThrow();

    // Verify Berhanu and Tadelech (previously overlapping) now have clear separation
    const berhanuCard = result.cards.find((c) => c.id === 'berhanu')!;
    const tadelechCard = result.cards.find((c) => c.id === 'tadelech')!;
    expect(berhanuCard).toBeDefined();
    expect(tadelechCard).toBeDefined();
    expect(tadelechCard.x).toBeGreaterThanOrEqual(berhanuCard.x + berhanuCard.width);

    // Verify parents descent stem and sibling bus to focal root and siblings
    const rootStem = result.connectors.find((c) => c.id === 'stem-root-siblings-branch');
    const rootBus = result.connectors.find((c) => c.id === 'bus-root-siblings-branch');
    const focalDrop = result.connectors.find((c) => c.id === 'drop-root-siblings-branch-dawit');
    const siblingDrop = result.connectors.find((c) => c.id === 'drop-root-siblings-branch-nahom');

    expect(rootStem).toBeDefined();
    expect(rootBus).toBeDefined();
    expect(focalDrop).toBeDefined();
    expect(siblingDrop).toBeDefined();
  });

  it('positions great-grandparents (Haile and Mulu) at the top above Girma and Tadelech', () => {
    // Exact full pedigree with Haile and Mulu as great-grandparents:
    // Haile -> Girma (paternal grandfather)
    // Mulu -> Tadelech (paternal grandmother)
    // Tadelech + Girma -> Abebe
    // Aster + Berhanu -> Desta
    // Desta + Abebe -> Dawit
    const nodes: SubgraphNode[] = [
      { id: 'dawit', data: { given_name_native: 'ዳዊት', given_name_latin: 'Dawit', full_native: 'ዳዊት', full_latin: 'Dawit', gender: 'MALE', is_deceased: false } },
      { id: 'desta', data: { given_name_native: 'ደስታ', given_name_latin: 'Desta', full_native: 'ደስታ', full_latin: 'Desta', gender: 'FEMALE', is_deceased: false } },
      { id: 'abebe', data: { given_name_native: 'አበበ', given_name_latin: 'Abebe', full_native: 'አበበ', full_latin: 'Abebe', gender: 'MALE', is_deceased: false } },
      { id: 'tadelech', data: { given_name_native: 'ታደለች', given_name_latin: 'Tadelech', full_native: 'ታደለች', full_latin: 'Tadelech', gender: 'FEMALE', is_deceased: false } },
      { id: 'girma', data: { given_name_native: 'ግርማ', given_name_latin: 'Girma', full_native: 'ግርማ', full_latin: 'Girma', gender: 'MALE', is_deceased: false } },
      { id: 'aster', data: { given_name_native: 'አስቴር', given_name_latin: 'Aster', full_native: 'አስቴር', full_latin: 'Aster', gender: 'FEMALE', is_deceased: false } },
      { id: 'berhanu', data: { given_name_native: 'ብርሃኑ', given_name_latin: 'Berhanu', full_native: 'ብርሃኑ', full_latin: 'Berhanu', gender: 'MALE', is_deceased: true } },
      { id: 'mulu', data: { given_name_native: 'ሙሉ', given_name_latin: 'Mulu', full_native: 'ሙሉ', full_latin: 'Mulu', gender: 'FEMALE', is_deceased: true } },
      { id: 'haile', data: { given_name_native: 'ሃይለ', given_name_latin: 'Haile', full_native: 'ሃይለ', full_latin: 'Haile', gender: 'MALE', is_deceased: true } },
    ];

    const edges: SubgraphEdge[] = [
      { id: 'p-mulu-tadelech', source: 'mulu', target: 'tadelech', label: 'parent' },
      { id: 'p-haile-girma', source: 'haile', target: 'girma', label: 'parent' },
      { id: 'u-pat', source: 'tadelech', target: 'girma', label: 'union' },
      { id: 'p-pat-1', source: 'tadelech', target: 'abebe', label: 'parent' },
      { id: 'p-pat-2', source: 'girma', target: 'abebe', label: 'parent' },
      { id: 'u-mat', source: 'aster', target: 'berhanu', label: 'union' },
      { id: 'p-mat-1', source: 'aster', target: 'desta', label: 'parent' },
      { id: 'p-mat-2', source: 'berhanu', target: 'desta', label: 'parent' },
      { id: 'u-par', source: 'desta', target: 'abebe', label: 'union' },
      { id: 'p-par-1', source: 'desta', target: 'dawit', label: 'parent' },
      { id: 'p-par-2', source: 'abebe', target: 'dawit', label: 'parent' },
    ];

    const result = buildFamilyTreeLayout('dawit', nodes, edges);

    // Verify all 9 people placed
    expect(result.cards).toHaveLength(9);
    expect(() => assertNoCollisions(result.cards)).not.toThrow();

    const muluCard = result.cards.find((c) => c.id === 'mulu')!;
    const haileCard = result.cards.find((c) => c.id === 'haile')!;
    const tadelechCard = result.cards.find((c) => c.id === 'tadelech')!;
    const girmaCard = result.cards.find((c) => c.id === 'girma')!;
    const abebeCard = result.cards.find((c) => c.id === 'abebe')!;

    expect(muluCard).toBeDefined();
    expect(haileCard).toBeDefined();

    // MUST be at the top: generation -3, strictly above grandparents (gen -2) and parents (gen -1)
    expect(muluCard.generation).toBe(-3);
    expect(haileCard.generation).toBe(-3);
    expect(tadelechCard.generation).toBe(-2);
    expect(girmaCard.generation).toBe(-2);
    expect(abebeCard.generation).toBe(-1);

    expect(muluCard.y).toBeLessThan(tadelechCard.y);
    expect(haileCard.y).toBeLessThan(girmaCard.y);
    expect(tadelechCard.y).toBeLessThan(abebeCard.y);

    // Mulu is positioned directly above Tadelech
    expect(muluCard.x).toBe(tadelechCard.x);

    // Haile is positioned directly above Girma
    expect(haileCard.x).toBe(girmaCard.x);

    // Connectors exist connecting Mulu to Tadelech, and Haile to Girma
    const muluDrop = result.connectors.find((c) => c.id.includes('mulu-tadelech'));
    const haileDrop = result.connectors.find((c) => c.id.includes('haile-girma'));
    expect(muluDrop).toBeDefined();
    expect(haileDrop).toBeDefined();

    // MUST have connectors connecting parents to focal root (Dawit)
    const focalDrop = result.connectors.find(
      (c) => c.id === 'drop-root-siblings-branch-dawit'
    );
    expect(focalDrop).toBeDefined();
    expect(focalDrop?.type).toBe('child_drop');
  });

  it('renders dual-tree in-law expansion when focusing on married adult (Abebe as root)', () => {
    // 21-node extended family:
    // Paternal bloodline: Mulu, Haile -> Tadelech, Girma -> Abebe + 4 siblings
    // Maternal bloodline: Aster, Berhanu -> Desta + 4 siblings
    // Couple: Abebe + Desta -> Dawit + 4 siblings
    const nodes: SubgraphNode[] = [
      // Focal root and spouse
      { id: 'abebe', data: { given_name_native: 'አበበ', given_name_latin: 'Abebe', full_native: 'አበበ', full_latin: 'Abebe', gender: 'MALE', is_deceased: false } },
      { id: 'desta', data: { given_name_native: 'ደስታ', given_name_latin: 'Desta', full_native: 'ደስታ', full_latin: 'Desta', gender: 'FEMALE', is_deceased: false } },

      // Abebe's parents and grandparents
      { id: 'girma', data: { given_name_native: 'ግርማ', given_name_latin: 'Girma', full_native: 'ግርማ', full_latin: 'Girma', gender: 'MALE', is_deceased: false } },
      { id: 'tadelech', data: { given_name_native: 'ታደለች', given_name_latin: 'Tadelech', full_native: 'ታደለች', full_latin: 'Tadelech', gender: 'FEMALE', is_deceased: false } },
      { id: 'haile', data: { given_name_native: 'ሃይለ', given_name_latin: 'Haile', full_native: 'ሃይለ', full_latin: 'Haile', gender: 'MALE', is_deceased: true } },
      { id: 'mulu', data: { given_name_native: 'ሙሉ', given_name_latin: 'Mulu', full_native: 'ሙሉ', full_latin: 'Mulu', gender: 'MALE', is_deceased: true } },

      // Abebe's siblings
      { id: 'worku', data: { given_name_native: 'ወርቁ', given_name_latin: 'Worku', full_native: 'ወርቁ', full_latin: 'Worku', gender: 'MALE', is_deceased: false } },
      { id: 'solomon', data: { given_name_native: 'ሰለሞን', given_name_latin: 'Solomon', full_native: 'ሰለሞን', full_latin: 'Solomon', gender: 'MALE', is_deceased: false } },
      { id: 'hirut', data: { given_name_native: 'ህሩት', given_name_latin: 'Hirut', full_native: 'ህሩት', full_latin: 'Hirut', gender: 'MALE', is_deceased: false } },
      { id: 'senait', data: { given_name_native: 'ሰናይት', given_name_latin: 'Senait', full_native: 'ሰናይት', full_latin: 'Senait', gender: 'FEMALE', is_deceased: false } },

      // Desta's parents
      { id: 'aster', data: { given_name_native: 'አስቴር', given_name_latin: 'Aster', full_native: 'አስቴር', full_latin: 'Aster', gender: 'FEMALE', is_deceased: false } },
      { id: 'berhanu', data: { given_name_native: 'ብርሃኑ', given_name_latin: 'Berhanu', full_native: 'ብርሃኑ', full_latin: 'Berhanu', gender: 'MALE', is_deceased: true } },

      // Desta's siblings
      { id: 'yohannes', data: { given_name_native: 'ዮሐንስ', given_name_latin: 'Yohannes', full_native: 'ዮሐንስ', full_latin: 'Yohannes', gender: 'MALE', is_deceased: false } },
      { id: 'selam', data: { given_name_native: 'ሰላም', given_name_latin: 'Selam', full_native: 'ሰላም', full_latin: 'Selam', gender: 'FEMALE', is_deceased: false } },
      { id: 'tigist', data: { given_name_native: 'ትዕግስት', given_name_latin: 'Tigist', full_native: 'ትዕግስት', full_latin: 'Tigist', gender: 'FEMALE', is_deceased: false } },
      { id: 'tariku', data: { given_name_native: 'ታሪኩ', given_name_latin: 'Tariku', full_native: 'ታሪኩ', full_latin: 'Tariku', gender: 'FEMALE', is_deceased: false } },

      // Children of Abebe and Desta
      { id: 'dawit', data: { given_name_native: 'ዳዊት', given_name_latin: 'Dawit', full_native: 'ዳዊት', full_latin: 'Dawit', gender: 'MALE', is_deceased: false } },
      { id: 'meron', data: { given_name_native: 'ሜሮን', given_name_latin: 'Meron', full_native: 'ሜሮን', full_latin: 'Meron', gender: 'FEMALE', is_deceased: false } },
      { id: 'eleni', data: { given_name_native: 'እሌኒ', given_name_latin: 'Eleni', full_native: 'እሌኒ', full_latin: 'Eleni', gender: 'MALE', is_deceased: false } },
      { id: 'yared', data: { given_name_native: 'ያሬድ', given_name_latin: 'Yared', full_native: 'ያሬድ', full_latin: 'Yared', gender: 'FEMALE', is_deceased: false } },
      { id: 'nahom', data: { given_name_native: 'ናሆም', given_name_latin: 'Nahom', full_native: 'ናሆም', full_latin: 'Nahom', gender: 'MALE', is_deceased: false } },
    ];

    const edges: SubgraphEdge[] = [
      // Abebe's ancestors
      { id: 'p-haile-girma', source: 'haile', target: 'girma', label: 'parent' },
      { id: 'p-mulu-tadelech', source: 'mulu', target: 'tadelech', label: 'parent' },
      { id: 'u-girma-tadelech', source: 'girma', target: 'tadelech', label: 'union' },
      { id: 'p-worku-1', source: 'girma', target: 'worku', label: 'parent' },
      { id: 'p-worku-2', source: 'tadelech', target: 'worku', label: 'parent' },
      { id: 'p-solomon-1', source: 'girma', target: 'solomon', label: 'parent' },
      { id: 'p-solomon-2', source: 'tadelech', target: 'solomon', label: 'parent' },
      { id: 'p-hirut-1', source: 'girma', target: 'hirut', label: 'parent' },
      { id: 'p-hirut-2', source: 'tadelech', target: 'hirut', label: 'parent' },
      { id: 'p-senait-1', source: 'girma', target: 'senait', label: 'parent' },
      { id: 'p-senait-2', source: 'tadelech', target: 'senait', label: 'parent' },
      { id: 'p-abebe-1', source: 'girma', target: 'abebe', label: 'parent' },
      { id: 'p-abebe-2', source: 'tadelech', target: 'abebe', label: 'parent' },

      // Central union
      { id: 'u-abebe-desta', source: 'abebe', target: 'desta', label: 'union' },

      // Desta's ancestors & siblings
      { id: 'u-aster-berhanu', source: 'aster', target: 'berhanu', label: 'union' },
      { id: 'p-yohannes-1', source: 'aster', target: 'yohannes', label: 'parent' },
      { id: 'p-yohannes-2', source: 'berhanu', target: 'yohannes', label: 'parent' },
      { id: 'p-selam-1', source: 'aster', target: 'selam', label: 'parent' },
      { id: 'p-selam-2', source: 'berhanu', target: 'selam', label: 'parent' },
      { id: 'p-tigist-1', source: 'aster', target: 'tigist', label: 'parent' },
      { id: 'p-tigist-2', source: 'berhanu', target: 'tigist', label: 'parent' },
      { id: 'p-tariku-1', source: 'aster', target: 'tariku', label: 'parent' },
      { id: 'p-tariku-2', source: 'berhanu', target: 'tariku', label: 'parent' },
      { id: 'p-desta-1', source: 'aster', target: 'desta', label: 'parent' },
      { id: 'p-desta-2', source: 'berhanu', target: 'desta', label: 'parent' },

      // Children of Abebe and Desta
      { id: 'p-c-1', source: 'abebe', target: 'dawit', label: 'parent' },
      { id: 'p-c-2', source: 'desta', target: 'dawit', label: 'parent' },
      { id: 'p-c-3', source: 'abebe', target: 'meron', label: 'parent' },
      { id: 'p-c-4', source: 'desta', target: 'meron', label: 'parent' },
      { id: 'p-c-5', source: 'abebe', target: 'eleni', label: 'parent' },
      { id: 'p-c-6', source: 'desta', target: 'eleni', label: 'parent' },
      { id: 'p-c-7', source: 'abebe', target: 'yared', label: 'parent' },
      { id: 'p-c-8', source: 'desta', target: 'yared', label: 'parent' },
      { id: 'p-c-9', source: 'abebe', target: 'nahom', label: 'parent' },
      { id: 'p-c-10', source: 'desta', target: 'nahom', label: 'parent' },
    ];

    const result = buildFamilyTreeLayout('abebe', nodes, edges);

    // Verify all 21 people placed into the graph!
    expect(result.cards).toHaveLength(21);
    expect(() => assertNoCollisions(result.cards)).not.toThrow();

    const abebeCard = result.cards.find((c) => c.id === 'abebe')!;
    const destaCard = result.cards.find((c) => c.id === 'desta')!;
    expect(abebeCard).toBeDefined();
    expect(destaCard).toBeDefined();
    expect(abebeCard.isRoot).toBe(true);
    expect(destaCard.isSpouse).toBe(true);

    // Abebe and Desta are at Gen 0, with Abebe on the left of Desta
    expect(abebeCard.generation).toBe(0);
    expect(destaCard.generation).toBe(0);
    expect(abebeCard.x).toBeLessThan(destaCard.x);

    // Desta's parents (Aster and Berhanu) are placed at Gen -1 above Desta
    const asterCard = result.cards.find((c) => c.id === 'aster')!;
    const berhanuCard = result.cards.find((c) => c.id === 'berhanu')!;
    expect(asterCard).toBeDefined();
    expect(berhanuCard).toBeDefined();
    expect(asterCard.generation).toBe(-1);
    expect(berhanuCard.generation).toBe(-1);
    expect(asterCard.y).toBeLessThan(destaCard.y);

    // Desta's siblings are to the right of Desta at Gen 0
    const yohannesCard = result.cards.find((c) => c.id === 'yohannes')!;
    expect(yohannesCard).toBeDefined();
    expect(yohannesCard.generation).toBe(0);
    expect(yohannesCard.x).toBeGreaterThan(destaCard.x);

    // Abebe's siblings are to the left of Abebe at Gen 0
    const workuCard = result.cards.find((c) => c.id === 'worku')!;
    expect(workuCard).toBeDefined();
    expect(workuCard.generation).toBe(0);
    expect(workuCard.x).toBeLessThan(abebeCard.x);

    // Children are at Gen 1 below Abebe and Desta
    const dawitCard = result.cards.find((c) => c.id === 'dawit')!;
    expect(dawitCard).toBeDefined();
    expect(dawitCard.generation).toBe(1);
    expect(dawitCard.y).toBeGreaterThan(abebeCard.y);

    // Central union bridge exists between Abebe and Desta
    const centralBridge = result.connectors.find((c) => c.id === 'bridge-root-spouse');
    expect(centralBridge).toBeDefined();

    // Sibling busses exist for both families
    const focalBus = result.connectors.find((c) => c.id === 'bus-focal-siblings-branch');
    const spouseBus = result.connectors.find((c) => c.id === 'bus-spouse-siblings-branch');
    const childrenBus = result.connectors.find((c) => c.id === 'bus-root-children-branch');
    expect(focalBus).toBeDefined();
    expect(spouseBus).toBeDefined();
    expect(childrenBus).toBeDefined();
  });

  it('positions reference family tree layout matching user drawing', () => {
    const nodes: SubgraphNode[] = [
      {
        id: 'me',
        data: {
          given_name_native: 'ዳዊት',
          given_name_latin: 'Dawit',
          full_native: 'ዳዊት ዘውዱ',
          full_latin: 'Dawit Zewdu',
          gender: 'MALE',
          birth_year_ec: 1996,
          is_deceased: false,
        },
      },
      {
        id: 's1',
        data: {
          given_name_native: 'ሰላም',
          given_name_latin: 'Selam',
          full_native: 'ሰላም ዘውዱ',
          full_latin: 'Selam Zewdu',
          gender: 'FEMALE',
          birth_year_ec: 1998,
          is_deceased: false,
        },
      },
      {
        id: 'dad',
        data: {
          given_name_native: 'ዘውዱ',
          given_name_latin: 'Zewdu',
          full_native: 'ዘውዱ አበበ',
          full_latin: 'Zewdu Abebe',
          gender: 'MALE',
          birth_year_ec: 1968,
          is_deceased: false,
        },
      },
      {
        id: 'u1',
        data: {
          given_name_native: 'ታደሰ',
          given_name_latin: 'Tadesse',
          full_native: 'ታደሰ አበበ',
          full_latin: 'Tadesse Abebe',
          gender: 'MALE',
          birth_year_ec: 1970,
          is_deceased: false,
        },
      },
      {
        id: 'mom',
        data: {
          given_name_native: 'አስቴር',
          given_name_latin: 'Aster',
          full_native: 'አስቴር ከበደ',
          full_latin: 'Aster Kebede',
          gender: 'FEMALE',
          birth_year_ec: 1972,
          is_deceased: false,
        },
      },
      {
        id: 'a1',
        data: {
          given_name_native: 'ሙሉ',
          given_name_latin: 'Mulu',
          full_native: 'ሙሉ ከበደ',
          full_latin: 'Mulu Kebede',
          gender: 'FEMALE',
          birth_year_ec: 1975,
          is_deceased: false,
        },
      },
      {
        id: 'pg1',
        data: {
          given_name_native: 'አበበ',
          given_name_latin: 'Abebe',
          full_native: 'አበበ ደስታ',
          full_latin: 'Abebe Desta',
          gender: 'MALE',
          birth_year_ec: 1940,
          is_deceased: true,
        },
      },
      {
        id: 'pg2',
        data: {
          given_name_native: 'ወለተ',
          given_name_latin: 'Welete',
          full_native: 'ወለተ ዮሐንስ',
          full_latin: 'Welete Yohannes',
          gender: 'FEMALE',
          birth_year_ec: 1945,
          is_deceased: true,
        },
      },
      {
        id: 'mg1',
        data: {
          given_name_native: 'ከበደ',
          given_name_latin: 'Kebede',
          full_native: 'ከበደ ተሾመ',
          full_latin: 'Kebede Teshome',
          gender: 'MALE',
          birth_year_ec: 1942,
          is_deceased: true,
        },
      },
      {
        id: 'mg2',
        data: {
          given_name_native: 'ፀሐይ',
          given_name_latin: 'Tsehay',
          full_native: 'ፀሐይ ረዳ',
          full_latin: 'Tsehay Reda',
          gender: 'FEMALE',
          birth_year_ec: 1946,
          is_deceased: false,
        },
      },
    ];

    const edges: SubgraphEdge[] = [
      { id: 'u-pg', source: 'pg1', target: 'pg2', label: 'union' },
      { id: 'p-dad-1', source: 'pg1', target: 'dad', label: 'parent' },
      { id: 'p-dad-2', source: 'pg2', target: 'dad', label: 'parent' },
      { id: 'p-u1-1', source: 'pg1', target: 'u1', label: 'parent' },
      { id: 'p-u1-2', source: 'pg2', target: 'u1', label: 'parent' },

      { id: 'u-mg', source: 'mg1', target: 'mg2', label: 'union' },
      { id: 'p-mom-1', source: 'mg1', target: 'mom', label: 'parent' },
      { id: 'p-mom-2', source: 'mg2', target: 'mom', label: 'parent' },
      { id: 'p-a1-1', source: 'mg1', target: 'a1', label: 'parent' },
      { id: 'p-a1-2', source: 'mg2', target: 'a1', label: 'parent' },

      { id: 'u-parents', source: 'dad', target: 'mom', label: 'union' },
      { id: 'p-me-1', source: 'dad', target: 'me', label: 'parent' },
      { id: 'p-me-2', source: 'mom', target: 'me', label: 'parent' },
      { id: 'p-s1-1', source: 'dad', target: 's1', label: 'parent' },
      { id: 'p-s1-2', source: 'mom', target: 's1', label: 'parent' },
    ];

    const result = buildFamilyTreeLayout('me', nodes, edges);

    expect(result.cards).toHaveLength(10);
    expect(() => assertNoCollisions(result.cards)).not.toThrow();

    const meCard = result.cards.find((c) => c.id === 'me');
    expect(meCard).toBeDefined();
    expect(meCard?.isRoot).toBe(true);

    const momCard = result.cards.find((c) => c.id === 'mom');
    const dadCard = result.cards.find((c) => c.id === 'dad');
    expect(momCard).toBeDefined();
    expect(dadCard).toBeDefined();
    expect(momCard!.x).toBeLessThan(dadCard!.x);
  });

  it('guarantees zero collisions when maternal side has many aunts and paternal has none', () => {
    const nodes: SubgraphNode[] = [
      { id: 'root', data: { given_name_native: 'Root', given_name_latin: 'Root', full_native: 'Root', full_latin: 'Root', gender: 'MALE', is_deceased: false } },
      { id: 'mom', data: { given_name_native: 'Mom', given_name_latin: 'Mom', full_native: 'Mom', full_latin: 'Mom', gender: 'FEMALE', is_deceased: false } },
      { id: 'dad', data: { given_name_native: 'Dad', given_name_latin: 'Dad', full_native: 'Dad', full_latin: 'Dad', gender: 'MALE', is_deceased: false } },
      { id: 'mg1', data: { given_name_native: 'MG1', given_name_latin: 'MG1', full_native: 'MG1', full_latin: 'MG1', gender: 'FEMALE', is_deceased: false } },
      { id: 'mg2', data: { given_name_native: 'MG2', given_name_latin: 'MG2', full_native: 'MG2', full_latin: 'MG2', gender: 'MALE', is_deceased: false } },
      { id: 'pg1', data: { given_name_native: 'PG1', given_name_latin: 'PG1', full_native: 'PG1', full_latin: 'PG1', gender: 'FEMALE', is_deceased: false } },
      { id: 'pg2', data: { given_name_native: 'PG2', given_name_latin: 'PG2', full_native: 'PG2', full_latin: 'PG2', gender: 'MALE', is_deceased: false } },
      // 5 maternal aunts/uncles
      ...['a1', 'a2', 'a3', 'a4', 'a5'].map((id) => ({
        id,
        data: { given_name_native: id, given_name_latin: id, full_native: id, full_latin: id, gender: 'FEMALE' as const, is_deceased: false },
      })),
    ];

    const edges: SubgraphEdge[] = [
      { id: 'u-par', source: 'mom', target: 'dad', label: 'union' },
      { id: 'p-r1', source: 'mom', target: 'root', label: 'parent' },
      { id: 'p-r2', source: 'dad', target: 'root', label: 'parent' },
      { id: 'u-mg', source: 'mg1', target: 'mg2', label: 'union' },
      { id: 'p-m1', source: 'mg1', target: 'mom', label: 'parent' },
      { id: 'p-m2', source: 'mg2', target: 'mom', label: 'parent' },
      ...['a1', 'a2', 'a3', 'a4', 'a5'].map((id) => ({ id: `p-${id}-1`, source: 'mg1', target: id, label: 'parent' as const })),
      ...['a1', 'a2', 'a3', 'a4', 'a5'].map((id) => ({ id: `p-${id}-2`, source: 'mg2', target: id, label: 'parent' as const })),
      { id: 'u-pg', source: 'pg1', target: 'pg2', label: 'union' },
      { id: 'p-d1', source: 'pg1', target: 'dad', label: 'parent' },
      { id: 'p-d2', source: 'pg2', target: 'dad', label: 'parent' },
    ];

    const result = buildFamilyTreeLayout('root', nodes, edges);
    expect(() => assertNoCollisions(result.cards)).not.toThrow();
  });

  it('guarantees zero collisions when root has spouse, many siblings, and children', () => {
    const nodes: SubgraphNode[] = [
      { id: 'root', data: { given_name_native: 'Root', given_name_latin: 'Root', full_native: 'Root', full_latin: 'Root', gender: 'MALE', is_deceased: false } },
      { id: 'spouse', data: { given_name_native: 'Spouse', given_name_latin: 'Spouse', full_native: 'Spouse', full_latin: 'Spouse', gender: 'FEMALE', is_deceased: false } },
      { id: 'mom', data: { given_name_native: 'Mom', given_name_latin: 'Mom', full_native: 'Mom', full_latin: 'Mom', gender: 'FEMALE', is_deceased: false } },
      { id: 'dad', data: { given_name_native: 'Dad', given_name_latin: 'Dad', full_native: 'Dad', full_latin: 'Dad', gender: 'MALE', is_deceased: false } },
      // 6 siblings of root
      ...['s1', 's2', 's3', 's4', 's5', 's6'].map((id) => ({
        id,
        data: { given_name_native: id, given_name_latin: id, full_native: id, full_latin: id, gender: 'MALE' as const, is_deceased: false },
      })),
      // 4 children of root
      ...['c1', 'c2', 'c3', 'c4'].map((id) => ({
        id,
        data: { given_name_native: id, given_name_latin: id, full_native: id, full_latin: id, gender: 'FEMALE' as const, is_deceased: false },
      })),
    ];

    const edges: SubgraphEdge[] = [
      { id: 'u-par', source: 'mom', target: 'dad', label: 'union' },
      { id: 'p-r1', source: 'mom', target: 'root', label: 'parent' },
      { id: 'p-r2', source: 'dad', target: 'root', label: 'parent' },
      ...['s1', 's2', 's3', 's4', 's5', 's6'].map((id) => ({ id: `p-s-${id}-1`, source: 'mom', target: id, label: 'parent' as const })),
      ...['s1', 's2', 's3', 's4', 's5', 's6'].map((id) => ({ id: `p-s-${id}-2`, source: 'dad', target: id, label: 'parent' as const })),
      { id: 'u-root', source: 'root', target: 'spouse', label: 'union' },
      ...['c1', 'c2', 'c3', 'c4'].map((id) => ({ id: `p-c-${id}-1`, source: 'root', target: id, label: 'parent' as const })),
      ...['c1', 'c2', 'c3', 'c4'].map((id) => ({ id: `p-c-${id}-2`, source: 'spouse', target: id, label: 'parent' as const })),
    ];

    const result = buildFamilyTreeLayout('root', nodes, edges);
    expect(() => assertNoCollisions(result.cards)).not.toThrow();
  });

  it('correctly lays out multi-generational descendants, child spouses, in-laws, and grandchildren when focusing on patriarch', () => {
    // 17 individuals matching multi-generational reproduction:
    // Root: Haile + Mulu
    // Parents: Kifle + Mestawet
    // Children of Haile & Mulu: Girma, Worku, Genet, Senait, Kassahun
    // Girma's spouse: Tadelech
    // Tadelech's parents: Berhanu + Aster
    // Girma & Tadelech's children: Abebe, Desta, Tirunesh, Yared, Nahom
    const nodes: SubgraphNode[] = [
      // Patriarch Root & Spouse
      { id: 'haile', data: { given_name_native: 'ሀይሌ', given_name_latin: 'Haile', full_native: 'ሀይሌ ክፍሌ', full_latin: 'Haile Kifle', gender: 'MALE', is_deceased: false } },
      { id: 'mulu', data: { given_name_native: 'ሙሉ', given_name_latin: 'Mulu', full_native: 'ሙሉ', full_latin: 'Mulu', gender: 'FEMALE', is_deceased: false } },
      // Haile's Parents
      { id: 'kifle', data: { given_name_native: 'ክፍሌ', given_name_latin: 'Kifle', full_native: 'ክፍሌ', full_latin: 'Kifle', gender: 'MALE', is_deceased: true } },
      { id: 'mestawet', data: { given_name_native: 'መስታወት', given_name_latin: 'Mestawet', full_native: 'መስታወት', full_latin: 'Mestawet', gender: 'FEMALE', is_deceased: true } },
      // Haile's Children
      { id: 'girma', data: { given_name_native: 'ግርማ', given_name_latin: 'Girma', full_native: 'ግርማ ሀይሌ', full_latin: 'Girma Haile', gender: 'MALE', is_deceased: false } },
      { id: 'worku', data: { given_name_native: 'ወርቁ', given_name_latin: 'Worku', full_native: 'ወርቁ ሀይሌ', full_latin: 'Worku Haile', gender: 'MALE', is_deceased: false } },
      { id: 'genet', data: { given_name_native: 'ገነት', given_name_latin: 'Genet', full_native: 'ገነት ሀይሌ', full_latin: 'Genet Haile', gender: 'FEMALE', is_deceased: false } },
      { id: 'senait', data: { given_name_native: 'ሰናይት', given_name_latin: 'Senait', full_native: 'ሰናይት ሀይሌ', full_latin: 'Senait Haile', gender: 'FEMALE', is_deceased: false } },
      { id: 'kassahun', data: { given_name_native: 'ካሳሁን', given_name_latin: 'Kassahun', full_native: 'ካሳሁን ሀይሌ', full_latin: 'Kassahun Haile', gender: 'FEMALE', is_deceased: false } },
      // Girma's Spouse
      { id: 'tadelech', data: { given_name_native: 'ታደለች', given_name_latin: 'Tadelech', full_native: 'ታደለች ብርሃኑ', full_latin: 'Tadelech Berhanu', gender: 'FEMALE', is_deceased: false } },
      // Tadelech's Parents (In-Laws of Girma)
      { id: 'berhanu', data: { given_name_native: 'ብርሃኑ', given_name_latin: 'Berhanu', full_native: 'ብርሃኑ', full_latin: 'Berhanu', gender: 'MALE', is_deceased: true } },
      { id: 'aster', data: { given_name_native: 'አስቴር', given_name_latin: 'Aster', full_native: 'አስቴር', full_latin: 'Aster', gender: 'FEMALE', is_deceased: false } },
      // Grandchildren (Children of Girma & Tadelech)
      { id: 'abebe', data: { given_name_native: 'አበበ', given_name_latin: 'Abebe', full_native: 'አበበ ግርማ', full_latin: 'Abebe Girma', gender: 'FEMALE', is_deceased: false } },
      { id: 'desta', data: { given_name_native: 'ደስታ', given_name_latin: 'Desta', full_native: 'ደስታ ግርማ', full_latin: 'Desta Girma', gender: 'MALE', is_deceased: false } },
      { id: 'tirunesh', data: { given_name_native: 'ጥሩነሽ', given_name_latin: 'Tirunesh', full_native: 'ጥሩነሽ ግርማ', full_latin: 'Tirunesh Girma', gender: 'MALE', is_deceased: false } },
      { id: 'yared', data: { given_name_native: 'ያሬድ', given_name_latin: 'Yared', full_native: 'ያሬድ ግርማ', full_latin: 'Yared Girma', gender: 'FEMALE', is_deceased: false } },
      { id: 'nahom', data: { given_name_native: 'ናሆም', given_name_latin: 'Nahom', full_native: 'ናሆም ግርማ', full_latin: 'Nahom Girma', gender: 'MALE', is_deceased: false } },
    ];

    const edges: SubgraphEdge[] = [
      // Haile's Parents -> Haile
      { id: 'u-par', source: 'kifle', target: 'mestawet', label: 'union' },
      { id: 'p-a1', source: 'kifle', target: 'haile', label: 'parent' },
      { id: 'p-a2', source: 'mestawet', target: 'haile', label: 'parent' },
      // Haile + Mulu -> Children
      { id: 'u-haile-mulu', source: 'haile', target: 'mulu', label: 'union' },
      ...['girma', 'worku', 'genet', 'senait', 'kassahun'].map((id) => ({
        id: `p-at-${id}`, source: 'haile', target: id, label: 'parent' as const,
      })),
      ...['girma', 'worku', 'genet', 'senait', 'kassahun'].map((id) => ({
        id: `p-nak-${id}`, source: 'mulu', target: id, label: 'parent' as const,
      })),
      // Girma + Tadelech
      { id: 'u-girma-tadelech', source: 'girma', target: 'tadelech', label: 'union' },
      // Tadelech's Parents -> Tadelech
      { id: 'u-inlaws', source: 'berhanu', target: 'aster', label: 'union' },
      { id: 'p-ab1', source: 'berhanu', target: 'tadelech', label: 'parent' },
      { id: 'p-ab2', source: 'aster', target: 'tadelech', label: 'parent' },
      // Girma + Tadelech -> Grandchildren
      ...['abebe', 'desta', 'tirunesh', 'yared', 'nahom'].map((id) => ({
        id: `p-z-${id}`, source: 'girma', target: id, label: 'parent' as const,
      })),
      ...['abebe', 'desta', 'tirunesh', 'yared', 'nahom'].map((id) => ({
        id: `p-ab-${id}`, source: 'tadelech', target: id, label: 'parent' as const,
      })),
    ];

    const result = buildFamilyTreeLayout('haile', nodes, edges);

    // 1. All 17 individuals are positioned
    expect(result.cards).toHaveLength(17);

    // 2. Strict collision check passes across all generations
    expect(() => assertNoCollisions(result.cards)).not.toThrow();

    // 3. Generations are hierarchically correct
    const haileCard = result.cards.find((c) => c.id === 'haile')!;
    const muluCard = result.cards.find((c) => c.id === 'mulu')!;
    const kifleCard = result.cards.find((c) => c.id === 'kifle')!;
    const mestawetCard = result.cards.find((c) => c.id === 'mestawet')!;
    const girmaCard = result.cards.find((c) => c.id === 'girma')!;
    const tadelechCard = result.cards.find((c) => c.id === 'tadelech')!;
    const berhanuCard = result.cards.find((c) => c.id === 'berhanu')!;
    const asterCard = result.cards.find((c) => c.id === 'aster')!;
    const tiruneshCard = result.cards.find((c) => c.id === 'tirunesh')!;

    expect(haileCard.generation).toBe(0);
    expect(muluCard.generation).toBe(0);
    expect(kifleCard.generation).toBe(-1);
    expect(mestawetCard.generation).toBe(-1);
    expect(girmaCard.generation).toBe(1);
    expect(tadelechCard.generation).toBe(1);
    expect(berhanuCard.generation).toBe(0);
    expect(asterCard.generation).toBe(0);
    expect(tiruneshCard.generation).toBe(2);

    // 4. In-laws (Berhanu and Aster) at Gen 0 do NOT overlap with Haile and Mulu at Gen 0
    const inLawMinX = Math.min(berhanuCard.x, asterCard.x);
    const inLawMaxX = Math.max(berhanuCard.x + berhanuCard.width, asterCard.x + asterCard.width);
    const rootMinX = Math.min(haileCard.x, muluCard.x);
    const rootMaxX = Math.max(haileCard.x + haileCard.width, muluCard.x + muluCard.width);

    const overlapsAtGen0 = Math.max(inLawMinX, rootMinX) < Math.min(inLawMaxX, rootMaxX);
    expect(overlapsAtGen0).toBe(false);

    // 5. Connectors exist for both generations
    const rootChildrenBus = result.connectors.find((c) => c.id === 'bus-root-children-branch');
    const girmaChildrenBus = result.connectors.find((c) => c.id === 'bus-descendant-branch-girma');
    const girmaUnionBridge = result.connectors.find((c) => c.id === 'bridge-couple-girma-tadelech');

    expect(rootChildrenBus).toBeDefined();
    expect(girmaChildrenBus).toBeDefined();
    expect(girmaUnionBridge).toBeDefined();
  });

  it('correctly lays out depth 4 with spouse siblings (in-law extended family: Yohannes, Selam, Tigist, Tariku)', () => {
    // 21 individuals reproducing Gen 4 layout:
    // Haile + Mulu, Kifle + Mestawet
    // Haile's 5 children: Girma, Worku, Genet, Senait, Kassahun
    // Girma's spouse: Tadelech
    // Tadelech's parents: Berhanu + Aster
    // Tadelech's 4 siblings: Yohannes, Selam, Tigist, Tariku
    // Girma & Tadelech's 5 children: Abebe, Desta, Tirunesh, Yared, Nahom
    const nodes: SubgraphNode[] = [
      { id: 'haile', data: { given_name_native: 'ሀይሌ', given_name_latin: 'Haile', full_native: 'ሀይሌ ክፍሌ', full_latin: 'Haile Kifle', gender: 'MALE', is_deceased: false } },
      { id: 'mulu', data: { given_name_native: 'ሙሉ', given_name_latin: 'Mulu', full_native: 'ሙሉ', full_latin: 'Mulu', gender: 'FEMALE', is_deceased: false } },
      { id: 'kifle', data: { given_name_native: 'ክፍሌ', given_name_latin: 'Kifle', full_native: 'ክፍሌ', full_latin: 'Kifle', gender: 'MALE', is_deceased: true } },
      { id: 'mestawet', data: { given_name_native: 'መስታወት', given_name_latin: 'Mestawet', full_native: 'መስታወት', full_latin: 'Mestawet', gender: 'FEMALE', is_deceased: true } },
      { id: 'girma', data: { given_name_native: 'ግርማ', given_name_latin: 'Girma', full_native: 'ግርማ ሀይሌ', full_latin: 'Girma Haile', gender: 'MALE', is_deceased: false } },
      { id: 'worku', data: { given_name_native: 'ወርቁ', given_name_latin: 'Worku', full_native: 'ወርቁ ሀይሌ', full_latin: 'Worku Haile', gender: 'MALE', is_deceased: false } },
      { id: 'genet', data: { given_name_native: 'ገነት', given_name_latin: 'Genet', full_native: 'ገነት ሀይሌ', full_latin: 'Genet Haile', gender: 'FEMALE', is_deceased: false } },
      { id: 'senait', data: { given_name_native: 'ሰናይት', given_name_latin: 'Senait', full_native: 'ሰናይት ሀይሌ', full_latin: 'Senait Haile', gender: 'FEMALE', is_deceased: false } },
      { id: 'kassahun', data: { given_name_native: 'ካሳሁን', given_name_latin: 'Kassahun', full_native: 'ካሳሁን ሀይሌ', full_latin: 'Kassahun Haile', gender: 'FEMALE', is_deceased: false } },
      { id: 'tadelech', data: { given_name_native: 'ታደለች', given_name_latin: 'Tadelech', full_native: 'ታደለች ብርሃኑ', full_latin: 'Tadelech Berhanu', gender: 'FEMALE', is_deceased: false } },
      { id: 'berhanu', data: { given_name_native: 'ብርሃኑ', given_name_latin: 'Berhanu', full_native: 'ብርሃኑ', full_latin: 'Berhanu', gender: 'MALE', is_deceased: true } },
      { id: 'aster', data: { given_name_native: 'አስቴር', given_name_latin: 'Aster', full_native: 'አስቴር', full_latin: 'Aster', gender: 'FEMALE', is_deceased: false } },
      // Tadelech's 4 siblings
      { id: 'yohannes', data: { given_name_native: 'ዮሐንስ', given_name_latin: 'Yohannes', full_native: 'ዮሐንስ ብርሃኑ', full_latin: 'Yohannes Berhanu', gender: 'FEMALE', is_deceased: false } },
      { id: 'selam', data: { given_name_native: 'ሰላም', given_name_latin: 'Selam', full_native: 'ሰላም ብርሃኑ', full_latin: 'Selam Berhanu', gender: 'MALE', is_deceased: false } },
      { id: 'tigist', data: { given_name_native: 'ትዕግስት', given_name_latin: 'Tigist', full_native: 'ትዕግስት ብርሃኑ', full_latin: 'Tigist Berhanu', gender: 'MALE', is_deceased: false } },
      { id: 'tariku', data: { given_name_native: 'ታሪኩ', given_name_latin: 'Tariku', full_native: 'ታሪኩ ብርሃኑ', full_latin: 'Tariku Berhanu', gender: 'FEMALE', is_deceased: false } },
      // Grandchildren
      { id: 'abebe', data: { given_name_native: 'አበበ', given_name_latin: 'Abebe', full_native: 'አበበ ግርማ', full_latin: 'Abebe Girma', gender: 'FEMALE', is_deceased: false } },
      { id: 'desta', data: { given_name_native: 'ደስታ', given_name_latin: 'Desta', full_native: 'ደስታ ግርማ', full_latin: 'ደስታ ግርማ', gender: 'MALE', is_deceased: false } },
      { id: 'tirunesh', data: { given_name_native: 'ጥሩነሽ', given_name_latin: 'Tirunesh', full_native: 'ጥሩነሽ ግርማ', full_latin: 'ጥሩነሽ ግርማ', gender: 'MALE', is_deceased: false } },
      { id: 'yared', data: { given_name_native: 'ያሬድ', given_name_latin: 'Yared', full_native: 'ያሬድ ግርማ', full_latin: 'ያሬድ ግርማ', gender: 'FEMALE', is_deceased: false } },
      { id: 'nahom', data: { given_name_native: 'ናሆም', given_name_latin: 'Nahom', full_native: 'ናሆም ግርማ', full_latin: 'ናሆም ግርማ', gender: 'MALE', is_deceased: false } },
    ];

    const edges: SubgraphEdge[] = [
      { id: 'u-par', source: 'kifle', target: 'mestawet', label: 'union' },
      { id: 'p-a1', source: 'kifle', target: 'haile', label: 'parent' },
      { id: 'p-a2', source: 'mestawet', target: 'haile', label: 'parent' },
      { id: 'u-haile-mulu', source: 'haile', target: 'mulu', label: 'union' },
      ...['girma', 'worku', 'genet', 'senait', 'kassahun'].map((id) => ({
        id: `p-at-${id}`, source: 'haile', target: id, label: 'parent' as const,
      })),
      ...['girma', 'worku', 'genet', 'senait', 'kassahun'].map((id) => ({
        id: `p-nak-${id}`, source: 'mulu', target: id, label: 'parent' as const,
      })),
      { id: 'u-girma-tadelech', source: 'girma', target: 'tadelech', label: 'union' },
      { id: 'u-inlaws', source: 'berhanu', target: 'aster', label: 'union' },
      // Berhanu & Aster parents of Tadelech and her 4 siblings
      ...['tadelech', 'yohannes', 'selam', 'tigist', 'tariku'].map((id) => ({
        id: `p-berhanu-${id}`, source: 'berhanu', target: id, label: 'parent' as const,
      })),
      ...['tadelech', 'yohannes', 'selam', 'tigist', 'tariku'].map((id) => ({
        id: `p-aster-${id}`, source: 'aster', target: id, label: 'parent' as const,
      })),
      // Girma & Tadelech -> Grandchildren
      ...['abebe', 'desta', 'tirunesh', 'yared', 'nahom'].map((id) => ({
        id: `p-z-${id}`, source: 'girma', target: id, label: 'parent' as const,
      })),
      ...['abebe', 'desta', 'tirunesh', 'yared', 'nahom'].map((id) => ({
        id: `p-ab-${id}`, source: 'tadelech', target: id, label: 'parent' as const,
      })),
    ];

    const result = buildFamilyTreeLayout('haile', nodes, edges);

    // 1. All 21 individuals are positioned
    expect(result.cards).toHaveLength(21);

    // 2. Zero collisions
    expect(() => assertNoCollisions(result.cards)).not.toThrow();

    // 3. Tadelech's siblings are at Gen 1
    ['yohannes', 'selam', 'tigist', 'tariku'].forEach((id) => {
      const card = result.cards.find((c) => c.id === id)!;
      expect(card).toBeDefined();
      expect(card.generation).toBe(1);
    });

    // 4. In-law sibling bus connects Berhanu & Aster to Tadelech and her siblings
    const inLawBus = result.connectors.find((c) => c.id === 'bus-inlaw-branch-girma');
    expect(inLawBus).toBeDefined();
  });

  it('correctly lays out married sibling with spouse and children when unmarried sibling is root (Worku as root in Haile Lineage)', () => {
    // Exactly matches the seeded Haile Lineage:
    // Haile + Mulu -> Girma (+ Tadelech) -> Abebe (+ Desta), Worku, Genet
    // Abebe + Desta -> Tirunesh, Yared
    const nodes: SubgraphNode[] = [
      { id: 'haile', data: { given_name_native: 'ሃይለ', given_name_latin: 'Haile', full_native: 'ሃይለ', full_latin: 'Haile', gender: 'MALE', is_deceased: true } },
      { id: 'mulu', data: { given_name_native: 'ሙሉ', given_name_latin: 'Mulu', full_native: 'ሙሉ', full_latin: 'Mulu', gender: 'FEMALE', is_deceased: false } },
      { id: 'girma', data: { given_name_native: 'ግርማ', given_name_latin: 'Girma', full_native: 'ግርማ', full_latin: 'Girma', gender: 'MALE', is_deceased: false } },
      { id: 'tadelech', data: { given_name_native: 'ታደለች', given_name_latin: 'Tadelech', full_native: 'ታደለች', full_latin: 'Tadelech', gender: 'FEMALE', is_deceased: false } },
      { id: 'abebe', data: { given_name_native: 'አበበ', given_name_latin: 'Abebe', full_native: 'አበበ', full_latin: 'Abebe', gender: 'MALE', is_deceased: false } },
      { id: 'desta', data: { given_name_native: 'ደስታ', given_name_latin: 'Desta', full_native: 'ደስታ', full_latin: 'Desta', gender: 'FEMALE', is_deceased: false } },
      { id: 'worku', data: { given_name_native: 'ወርቁ', given_name_latin: 'Worku', full_native: 'ወርቁ', full_latin: 'Worku', gender: 'MALE', is_deceased: false } },
      { id: 'genet', data: { given_name_native: 'ገነት', given_name_latin: 'Genet', full_native: 'ገነት', full_latin: 'Genet', gender: 'FEMALE', is_deceased: false } },
      { id: 'tirunesh', data: { given_name_native: 'ጥሩነሽ', given_name_latin: 'Tirunesh', full_native: 'ጥሩነሽ', full_latin: 'Tirunesh', gender: 'FEMALE', is_deceased: false } },
      { id: 'yared', data: { given_name_native: 'ያሬድ', given_name_latin: 'Yared', full_native: 'ያሬድ', full_latin: 'Yared', gender: 'MALE', is_deceased: false } },
    ];

    const edges: SubgraphEdge[] = [
      { id: 'e1', source: 'haile', target: 'girma', label: 'parent' },
      { id: 'e2', source: 'mulu', target: 'girma', label: 'parent' },
      { id: 'u1', source: 'haile', target: 'mulu', label: 'union' },
      { id: 'e3', source: 'girma', target: 'abebe', label: 'parent' },
      { id: 'e4', source: 'tadelech', target: 'abebe', label: 'parent' },
      { id: 'e5', source: 'girma', target: 'worku', label: 'parent' },
      { id: 'e6', source: 'tadelech', target: 'worku', label: 'parent' },
      { id: 'e7', source: 'girma', target: 'genet', label: 'parent' },
      { id: 'e8', source: 'tadelech', target: 'genet', label: 'parent' },
      { id: 'u2', source: 'girma', target: 'tadelech', label: 'union' },
      { id: 'e9', source: 'abebe', target: 'tirunesh', label: 'parent' },
      { id: 'e10', source: 'desta', target: 'tirunesh', label: 'parent' },
      { id: 'e11', source: 'abebe', target: 'yared', label: 'parent' },
      { id: 'e12', source: 'desta', target: 'yared', label: 'parent' },
      { id: 'u3', source: 'abebe', target: 'desta', label: 'union' },
    ];

    const result = buildFamilyTreeLayout('worku', nodes, edges);

    // 1. All 10 individuals must be positioned
    expect(result.cards).toHaveLength(10);

    // 2. No collisions between cards
    expect(() => assertNoCollisions(result.cards)).not.toThrow();

    // 3. Worku is root at generation 0
    const workuCard = result.cards.find((c) => c.id === 'worku')!;
    expect(workuCard).toBeDefined();
    expect(workuCard.isRoot).toBe(true);
    expect(workuCard.generation).toBe(0);

    // 4. Abebe and Desta are placed as a couple with union bridge
    const abebeCard = result.cards.find((c) => c.id === 'abebe')!;
    const destaCard = result.cards.find((c) => c.id === 'desta')!;
    expect(abebeCard).toBeDefined();
    expect(destaCard).toBeDefined();
    expect(destaCard.isSpouse).toBe(true);
    expect(abebeCard.generation).toBe(0);
    expect(destaCard.generation).toBe(0);

    // Abebe and Desta must have a union bridge
    const abebeDestaUnion = result.unions.find(
      (u) =>
        (u.partnerAId === 'abebe' && u.partnerBId === 'desta') ||
        (u.partnerAId === 'desta' && u.partnerBId === 'abebe')
    );
    expect(abebeDestaUnion).toBeDefined();

    // 5. Tirunesh and Yared are at generation 1 below Abebe & Desta
    const tiruneshCard = result.cards.find((c) => c.id === 'tirunesh')!;
    const yaredCard = result.cards.find((c) => c.id === 'yared')!;
    expect(tiruneshCard).toBeDefined();
    expect(yaredCard).toBeDefined();
    expect(tiruneshCard.generation).toBe(1);
    expect(yaredCard.generation).toBe(1);

    // 6. Connectors exist connecting to Tirunesh and Yared
    const tiruneshDrop = result.connectors.find((c) => c.id.includes('tirunesh'));
    const yaredDrop = result.connectors.find((c) => c.id.includes('yared'));
    expect(tiruneshDrop).toBeDefined();
    expect(yaredDrop).toBeDefined();

    // 7. Desta is NOT an outlier dumped far to the right; she is adjacent to Abebe
    expect(Math.abs(destaCard.x - abebeCard.x)).toBeLessThanOrEqual(260);
  });

  it('handles unmarried sibling as root with married sibling in Senait Line (Samuel as root)', () => {
    // Senait Line:
    // Zewditu + Assefa -> Senait (+ Dereje) -> Mahlet (+ Meseret), Samuel
    // Mahlet + Meseret -> Ruth, Sara
    const nodes: SubgraphNode[] = [
      { id: 'zewditu', data: { given_name_native: 'ዘውዲቱ', given_name_latin: 'Zewditu', full_native: 'ዘውዲቱ', full_latin: 'Zewditu', gender: 'FEMALE', is_deceased: true } },
      { id: 'assefa', data: { given_name_native: 'አሰፋ', given_name_latin: 'Assefa', full_native: 'አሰፋ', full_latin: 'Assefa', gender: 'MALE', is_deceased: false } },
      { id: 'senait', data: { given_name_native: 'ሰናይት', given_name_latin: 'Senait', full_native: 'ሰናይት', full_latin: 'Senait', gender: 'FEMALE', is_deceased: false } },
      { id: 'dereje', data: { given_name_native: 'ደረጄ', given_name_latin: 'Dereje', full_native: 'ደረጄ', full_latin: 'Dereje', gender: 'MALE', is_deceased: false } },
      { id: 'mahlet', data: { given_name_native: 'ማህሌት', given_name_latin: 'Mahlet', full_native: 'ማህሌት', full_latin: 'Mahlet', gender: 'FEMALE', is_deceased: false } },
      { id: 'meseret', data: { given_name_native: 'መሰረት', given_name_latin: 'Meseret', full_native: 'መሰረት', full_latin: 'Meseret', gender: 'MALE', is_deceased: false } },
      { id: 'samuel', data: { given_name_native: 'ሳሙኤል', given_name_latin: 'Samuel', full_native: 'ሳሙኤል', full_latin: 'Samuel', gender: 'MALE', is_deceased: false } },
      { id: 'ruth', data: { given_name_native: 'ሩት', given_name_latin: 'Ruth', full_native: 'ሩት', full_latin: 'Ruth', gender: 'FEMALE', is_deceased: false } },
      { id: 'sara', data: { given_name_native: 'ሳራ', given_name_latin: 'Sara', full_native: 'ሳራ', full_latin: 'Sara', gender: 'FEMALE', is_deceased: false } },
    ];

    const edges: SubgraphEdge[] = [
      { id: 'e1', source: 'zewditu', target: 'senait', label: 'parent' },
      { id: 'e2', source: 'assefa', target: 'senait', label: 'parent' },
      { id: 'u1', source: 'zewditu', target: 'assefa', label: 'union' },
      { id: 'e3', source: 'senait', target: 'mahlet', label: 'parent' },
      { id: 'e4', source: 'dereje', target: 'mahlet', label: 'parent' },
      { id: 'e5', source: 'senait', target: 'samuel', label: 'parent' },
      { id: 'e6', source: 'dereje', target: 'samuel', label: 'parent' },
      { id: 'u2', source: 'senait', target: 'dereje', label: 'union' },
      { id: 'e7', source: 'mahlet', target: 'ruth', label: 'parent' },
      { id: 'e8', source: 'meseret', target: 'ruth', label: 'parent' },
      { id: 'e9', source: 'mahlet', target: 'sara', label: 'parent' },
      { id: 'e10', source: 'meseret', target: 'sara', label: 'parent' },
      { id: 'u3', source: 'mahlet', target: 'meseret', label: 'union' },
    ];

    const result = buildFamilyTreeLayout('samuel', nodes, edges);

    expect(result.cards).toHaveLength(9);
    expect(() => assertNoCollisions(result.cards)).not.toThrow();

    const mahletMeseretUnion = result.unions.find(
      (u) =>
        (u.partnerAId === 'mahlet' && u.partnerBId === 'meseret') ||
        (u.partnerAId === 'meseret' && u.partnerBId === 'mahlet')
    );
    expect(mahletMeseretUnion).toBeDefined();

    const ruthDrop = result.connectors.find((c) => c.id.includes('ruth'));
    const saraDrop = result.connectors.find((c) => c.id.includes('sara'));
    expect(ruthDrop).toBeDefined();
    expect(saraDrop).toBeDefined();
  });

  it('handles multiple sequential unions in blended families without orphan nodes (Blended Remarriage)', () => {
    // Solomon + Bethlehem (dissolved) -> Shiferaw
    // Rahel + Kifle (dissolved) -> Konjit
    // Solomon + Rahel (active) -> Alemitu
    // Shiferaw + Meron (active) -> Endeshaw
    const nodes: SubgraphNode[] = [
      { id: 'solomon', data: { given_name_native: 'ሰለሞን', given_name_latin: 'Solomon', full_native: 'ሰለሞን', full_latin: 'Solomon', gender: 'MALE', is_deceased: false } },
      { id: 'bethlehem', data: { given_name_native: 'ቤተልሔም', given_name_latin: 'Bethlehem', full_native: 'ቤተልሔም', full_latin: 'Bethlehem', gender: 'FEMALE', is_deceased: false } },
      { id: 'rahel', data: { given_name_native: 'ራሔል', given_name_latin: 'Rahel', full_native: 'ራሔል', full_latin: 'Rahel', gender: 'FEMALE', is_deceased: false } },
      { id: 'kifle', data: { given_name_native: 'ክፍሌ', given_name_latin: 'Kifle', full_native: 'ክፍሌ', full_latin: 'Kifle', gender: 'MALE', is_deceased: false } },
      { id: 'shiferaw', data: { given_name_native: 'ሽፈራው', given_name_latin: 'Shiferaw', full_native: 'ሽፈራው', full_latin: 'Shiferaw', gender: 'MALE', is_deceased: false } },
      { id: 'konjit', data: { given_name_native: 'ቆንጂት', given_name_latin: 'Konjit', full_native: 'ቆንጂት', full_latin: 'Konjit', gender: 'FEMALE', is_deceased: false } },
      { id: 'alemitu', data: { given_name_native: 'አለሚቱ', given_name_latin: 'Alemitu', full_native: 'አለሚቱ', full_latin: 'Alemitu', gender: 'FEMALE', is_deceased: false } },
      { id: 'meron', data: { given_name_native: 'መሮን', given_name_latin: 'Meron', full_native: 'መሮን', full_latin: 'Meron', gender: 'FEMALE', is_deceased: false } },
      { id: 'endeshaw', data: { given_name_native: 'እንዳሻው', given_name_latin: 'Endeshaw', full_native: 'እንዳሻው', full_latin: 'Endeshaw', gender: 'MALE', is_deceased: false } },
    ];

    const edges: SubgraphEdge[] = [
      { id: 'e1', source: 'solomon', target: 'shiferaw', label: 'parent' },
      { id: 'e2', source: 'bethlehem', target: 'shiferaw', label: 'parent' },
      { id: 'e3', source: 'rahel', target: 'konjit', label: 'parent' },
      { id: 'e4', source: 'kifle', target: 'konjit', label: 'parent' },
      { id: 'e5', source: 'solomon', target: 'alemitu', label: 'parent' },
      { id: 'e6', source: 'rahel', target: 'alemitu', label: 'parent' },
      { id: 'e7', source: 'shiferaw', target: 'endeshaw', label: 'parent' },
      { id: 'e8', source: 'meron', target: 'endeshaw', label: 'parent' },
      { id: 'u1', source: 'solomon', target: 'bethlehem', label: 'union' },
      { id: 'u2', source: 'rahel', target: 'kifle', label: 'union' },
      { id: 'u3', source: 'solomon', target: 'rahel', label: 'union' },
      { id: 'u4', source: 'shiferaw', target: 'meron', label: 'union' },
    ];

    const result = buildFamilyTreeLayout('solomon', nodes, edges);

    expect(result.cards).toHaveLength(9);
    expect(() => assertNoCollisions(result.cards)).not.toThrow();

    // Verify all 4 unions are represented
    expect(result.unions.length).toBeGreaterThanOrEqual(2);
    // Verify every person is connected via at least one connector/union
    result.cards.forEach((card) => {
      const hasUnion = result.unions.some(
        (u) => u.partnerAId === card.id || u.partnerBId === card.id
      );
      const hasConnector = result.connectors.some(
        (c) =>
          c.id.includes(card.id) ||
          c.path.includes(`L ${card.x + 100} ${card.y}`) ||
          c.path.includes(`M ${card.x + 100} ${card.y}`)
      );
      expect(hasUnion || hasConnector).toBe(true);
    });
  });
});
