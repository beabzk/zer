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
      list: vi.fn(async () => []),
      overview: vi.fn(async () => ({
        tree: { id: "stale-tree", name: "Stale", slug: "stale", role: "OWNER" },
        counts: { individuals: 0, edges: 0, unions: 0, events: 0, members: 0 },
        recent_individuals: [],
        recent_events: [],
      })),
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
});
