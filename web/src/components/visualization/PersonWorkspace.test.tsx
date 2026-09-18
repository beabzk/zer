import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PersonWorkspace } from "./PersonWorkspace";

vi.mock("../../lib/api", () => ({
  ApiError: class ApiError extends Error {},
  api: {
    individuals: {
      detail: vi.fn(async () => ({
        individual: {
          id: "person-1",
          full_native: "አበበ",
          full_latin: "Abebe",
          gender: "MALE",
          is_deceased: 0,
          titles: "[\"Ato\"]",
        },
        parents: [{
          id: "parent-1",
          full_native: "ወላጅ",
          full_latin: "Parent",
          gender: "MALE",
          relationship_type: "BIOLOGICAL",
          is_name_source: true,
        }],
        children: [],
        unions: [],
        events: [],
        permissions: { can_edit: true, can_delete: true },
      })),
    },
    analysis: {
      lineage: vi.fn(async () => ({ nodes: [] })),
    },
  },
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

describe("PersonWorkspace", () => {
  it("shows profile and relationships together in one scrollable inspector", async () => {
    await act(async () => {
      root.render(
        <PersonWorkspace
          locale="en"
          treeId="tree-1"
          personId="person-1"
          refreshKey={0}
          onEdit={() => undefined}
          onEdge={() => undefined}
          onFocus={() => undefined}
          onSelectPerson={() => undefined}
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('[role="tablist"]')).toBeNull();
    expect(container.textContent).toContain("Gender");
    expect(container.textContent).toContain("Birth");
    expect(container.textContent).toContain("Parents");
    expect(container.textContent).toContain("Children");
    expect(container.textContent).toContain("Unions");
    expect(container.textContent).toContain("Parent");
  });

  it("keeps lineage and events in closed disclosures until requested", async () => {
    await act(async () => {
      root.render(
        <PersonWorkspace
          locale="en"
          treeId="tree-1"
          personId="person-1"
          refreshKey={0}
          onEdit={() => undefined}
          onEdge={() => undefined}
          onFocus={() => undefined}
          onSelectPerson={() => undefined}
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const lineage = Array.from(container.querySelectorAll("details"))
      .find((details) => details.textContent?.includes("Lineage"))!;
    const events = Array.from(container.querySelectorAll("details"))
      .find((details) => details.textContent?.includes("Events"))!;
    expect(lineage.open).toBe(false);
    expect(events.open).toBe(false);
    expect(api.analysis.lineage).not.toHaveBeenCalled();

    await act(async () => {
      lineage.querySelector("summary")!.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(lineage.open).toBe(true);
    expect(api.analysis.lineage).toHaveBeenCalledWith("tree-1", "person-1", "ancestors", 3);
  });
});
