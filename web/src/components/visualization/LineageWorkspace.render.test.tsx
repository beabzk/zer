import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LineageWorkspace } from "./LineageWorkspace";

vi.mock("../../lib/api", () => ({
  api: {
    analysis: {
      lineage: vi.fn(async () => ({
        root_id: "root",
        direction: "ancestors",
        depth: 1,
        truncated: false,
        nodes: [
          {
            id: "root",
            depth: 0,
            path: ["root"],
            full_native: "Native name",
            full_latin: "Latin name",
            gender: "MALE",
            is_deceased: false,
          },
        ],
        unions: [],
      })),
    },
  },
}));

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

describe("LineageWorkspace", () => {
  it("prints the description once and labels the root person with an accessible label", async () => {
    await act(async () => {
      root.render(
        <LineageWorkspace locale="en" treeId="tree-1" rootId="root" refreshKey={0} onSelect={() => undefined} />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const descriptionNodes = Array.from(container.querySelectorAll("p"))
      .filter((node) => node.textContent === "Follow ancestors or descendants to any depth.");
    expect(descriptionNodes).toHaveLength(1);

    const rootButtons = container.querySelectorAll(
      'button[aria-label="Focused person: Latin name"]',
    );
    expect(rootButtons.length).toBeGreaterThanOrEqual(1);
  });
});
