import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

vi.mock("./lib/api", () => ({
  api: {
    admin: {
      status: vi.fn(async () => ({ is_admin: false })),
    },
    trees: {
      list: vi.fn(),
      stats: vi.fn(),
      overview: vi.fn(async () => ({
        tree: { id: "stale-tree", name: "Stale", slug: "stale", role: "OWNER" },
        counts: { individuals: 0, edges: 0, unions: 0, events: 0, members: 0 },
        recent_individuals: [],
        recent_events: [],
      })),
    },
    individuals: {
      detail: vi.fn(),
    },
    analysis: {
      subgraph: vi.fn(),
    },
  },
}));

vi.mock("./lib/auth", () => ({
  auth: {
    useSession: vi.fn(() => ({
      data: { user: { email: "owner@example.com" } },
      isPending: false,
    })),
    signout: vi.fn(async () => undefined),
  },
}));

const { api } = await import("./lib/api");

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  window.history.replaceState({}, "", "/overview");
  localStorage.clear();
  sessionStorage.clear();
  vi.mocked(api.trees.list).mockResolvedValue([]);
  vi.mocked(api.trees.stats).mockResolvedValue({
    tree_id: "tree-1",
    individuals: 1,
    edges: 0,
    unions: 0,
    events: 0,
    members: 1,
  });
  vi.mocked(api.individuals.detail).mockResolvedValue({
    individual: {
      id: "person-1",
      given_name_native: "አበበ",
      given_name_latin: "Abebe",
      full_native: "አበበ",
      full_latin: "Abebe",
      gender: "MALE",
      titles_display_enabled: 0,
      is_deceased: 0,
    },
    parents: [],
    children: [],
    unions: [],
    events: [],
    permissions: { can_edit: true, can_delete: true },
  });
  vi.mocked(api.analysis.subgraph).mockResolvedValue({ nodes: [], edges: [] });
  localStorage.setItem("zer-tree", "stale-tree");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
    await Promise.resolve();
  });
  container.remove();
  localStorage.clear();
  sessionStorage.clear();
});

describe("App", () => {
  it("clears a stale tree when the loaded tree list is empty", async () => {
    await act(async () => {
      root.render(<App />);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(api.trees.overview).not.toHaveBeenCalled();
    expect(localStorage.getItem("zer-tree")).toBeNull();
    expect(window.location.pathname).toBe("/overview");
  });

  it("does not number independent workspace views", async () => {
    await act(async () => {
      root.render(<App />);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const navLabels = Array.from(document.querySelectorAll("nav button")).map((button) => button.textContent ?? "");
    expect(navLabels.some((label) => /^\d{2}/.test(label))).toBe(false);
  });

  it("collapses and restores the tree rail and person inspector", async () => {
    const person = {
      id: "person-1",
      full_native: "አበበ",
      full_latin: "Abebe",
      gender: "MALE",
    };
    vi.mocked(api.trees.list).mockResolvedValue([{
      id: "tree-1",
      name: "Demo",
      slug: "demo",
      default_lang: "en",
      role: "OWNER",
    }]);
    vi.mocked(api.trees.overview).mockResolvedValue({
      tree: { id: "tree-1", name: "Demo", slug: "demo", default_lang: "en", role: "OWNER" },
      counts: { individuals: 1, edges: 0, unions: 0, events: 0, members: 1 },
      recent_individuals: [{ ...person, updated_at: "2026-01-01T00:00:00Z" }],
      recent_events: [],
    });
    window.history.replaceState({}, "", "/overview/tree-1");
    localStorage.setItem("zer-tree", "tree-1");

    await act(async () => {
      root.render(<App />);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const treeToggle = document.querySelector<HTMLButtonElement>('button[aria-controls="tree-rail"]')!;
    expect(document.getElementById("tree-rail")).not.toBeNull();
    await act(async () => {
      treeToggle.click();
      await Promise.resolve();
    });
    expect(document.getElementById("tree-rail")).toBeNull();
    expect(sessionStorage.getItem("zer-tree-rail")).toBe("collapsed");

    const personButton = Array.from(document.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Abebe"))!;
    await act(async () => {
      personButton.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    const inspectorToggle = document.querySelector<HTMLButtonElement>('button[aria-controls="person-inspector"]')!;
    expect(document.getElementById("person-inspector")).not.toBeNull();
    await act(async () => {
      inspectorToggle.click();
      await Promise.resolve();
    });
    expect(document.getElementById("person-inspector")).toBeNull();
    expect(sessionStorage.getItem("zer-inspector")).toBe("collapsed");

    await act(async () => {
      inspectorToggle.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(document.getElementById("person-inspector")).not.toBeNull();
  });
});
