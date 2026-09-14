import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TreeInvitationView } from "./TreeInvitationView";

vi.mock("../../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/api")>()),
  api: {
    treeInvitations: {
      validate: vi.fn(async () => ({
        email: "person@example.com",
        tree_id: "tree-1",
        tree_name: "Demo",
        role: "EDITOR",
        expires_at: "2026-01-08T00:00:00Z",
      })),
      accept: vi.fn(async () => undefined),
    },
  },
}));

const { api } = await import("../../lib/api");

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  window.location.hash = "#invite=token";
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  window.location.hash = "";
  vi.clearAllMocks();
});

describe("TreeInvitationView", () => {
  it("validates and accepts an invitation for the signed-in account", async () => {
    await act(async () => {
      root.render(<TreeInvitationView locale="en" />);
      await Promise.resolve();
    });

    expect(api.treeInvitations.validate).toHaveBeenCalledWith("token");
    expect(container.textContent).toContain("Demo");

    await act(async () => {
      const accept = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Accept invitation");
      accept!.click();
      await Promise.resolve();
    });

    expect(api.treeInvitations.accept).toHaveBeenCalledWith("token");
    expect(container.textContent).toContain("Invitation accepted");
  });
});
