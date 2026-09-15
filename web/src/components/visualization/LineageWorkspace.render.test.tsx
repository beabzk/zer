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
        nodes: [{ id: "root", depth: 0, path: ["root"] }],
      })),
    },
    individuals: {
      get: vi.fn(async () => ({
        id: "root",
        full_native: "Native name",
        full_latin: "Latin name",
        gender: "MALE",
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
  it("prints the description once and labels the root only in the column header", async () => {
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
    expect(container.textContent?.split("Focused person").length).toBe(2);
  });
});
