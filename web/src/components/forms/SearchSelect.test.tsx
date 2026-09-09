import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchSelect } from "./SearchSelect";

vi.mock("../../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/api")>()),
  api: {
    individuals: {
      list: vi.fn(async () => ({ individuals: [], total: 0, limit: 20, offset: 0 })),
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

describe("SearchSelect", () => {
  it("uses a unique listbox relationship for every combobox", async () => {
    await act(async () => {
      root.render(
        <>
          <SearchSelect locale="en" treeId="tree-1" value={null} onChange={() => undefined} />
          <SearchSelect locale="en" treeId="tree-1" value={null} onChange={() => undefined} />
        </>,
      );
    });

    const controls = Array.from(container.querySelectorAll('[role="combobox"]')).map((input) => input.getAttribute("aria-controls"));
    expect(controls[0]).toBeTruthy();
    expect(controls[1]).toBeTruthy();
    expect(controls[0]).not.toBe(controls[1]);
  });
});
