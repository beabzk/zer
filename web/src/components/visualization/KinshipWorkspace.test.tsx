import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { KinshipWorkspace } from "./KinshipWorkspace";
import type { KinshipResult } from "../../lib/api";

const personA = { id: "a", full_native: "An", full_latin: "Abebe", gender: "MALE" };
const personB = { id: "b", full_native: "Bn", full_latin: "Bontu", gender: "FEMALE" };
const intermediate = { id: "parent", full_native: "Pn", full_latin: "Parent", gender: "MALE" };

vi.mock("../../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/api")>()),
  api: {
    individuals: {
      list: vi.fn(async () => ({ individuals: [personA, personB], total: 2, limit: 8, offset: 0 })),
      get: vi.fn(),
    },
    analysis: {
      kinship: vi.fn(async (): Promise<KinshipResult> => ({
        path_key: "parent.child",
        degrees_of_sep: 2,
        segments: [
          { from_id: "a", to_id: "parent", relation: "PARENT", relationship_type: "BIOLOGICAL", is_name_source: true },
          { from_id: "parent", to_id: "b", relation: "CHILD", relationship_type: "BIOLOGICAL", is_name_source: true },
        ],
        individuals: {
          a: personA,
          parent: intermediate,
          b: personB,
        },
        term: {
          perspective: "a_to_b",
          key: "sibling",
          gender: "FEMALE",
          modifiers: ["full"],
          parameters: {
            shared_parents: 2,
            known_parents_a: 2,
            known_parents_b: 2,
          },
          confidence: "exact",
        },
      })),
    },
  },
}));

vi.mock("../forms/SearchSelect", () => ({
  SearchSelect: ({ onChange }: { onChange: (person: { id: string; full_native: string; full_latin: string; gender: string }) => void }) => (
    <div>
      <button type="button" onClick={() => onChange({ id: "a", full_native: "An", full_latin: "Abebe", gender: "MALE" })}>
        Choose Abebe
      </button>
      <button type="button" onClick={() => onChange({ id: "b", full_native: "Bn", full_latin: "Bontu", gender: "FEMALE" })}>
        Choose Bontu
      </button>
    </div>
  ),
}));

const { api } = await import("../../lib/api");

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe("KinshipWorkspace", () => {
  it("uses people returned by the kinship response instead of fetching each participant", async () => {
    await act(async () => {
      root.render(<KinshipWorkspace locale="en" treeId="tree-1" onSelectPerson={() => undefined} />);
    });

    const clickButton = async (label: string, index = 0) => {
      await act(async () => {
        const button = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
          .filter((candidate) => candidate.textContent === label)[index];
        if (!button) throw new Error(`Missing button: ${label}`);
        button.click();
        await Promise.resolve();
      });
    };
    await clickButton("Choose Abebe");
    await clickButton("Choose Bontu", 1);
    await clickButton("Find connection");

    expect(api.analysis.kinship).toHaveBeenCalledWith("tree-1", "a", "b");
    expect(api.individuals.get).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Abebe");
    expect(container.textContent).toContain("Parent");
    expect(container.textContent).toContain("Bontu");
  });
});
