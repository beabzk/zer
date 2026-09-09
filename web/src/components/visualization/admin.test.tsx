import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminPanel } from "./AdminPanel";
import { ToastProvider } from "../ui";
import type { TreeMember } from "../../lib/api";

const member: TreeMember = {
  tree_id: "tree-1",
  user_id: 3,
  role: "EDITOR",
  email: "editor@example.com",
  created_at: "2026-01-01T00:00:00Z",
};

vi.mock("../../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/api")>()),
  api: {
    admin: {
      users: vi.fn(async () => []),
      trees: vi.fn(async () => []),
      deleteTree: vi.fn(async () => undefined),
      deleteUser: vi.fn(async () => undefined),
    },
    trees: {
      members: vi.fn(async () => [member]),
      addMember: vi.fn(async () => member),
      updateMember: vi.fn(async (_treeId: string, _userId: number, role: TreeMember["role"]) => ({ ...member, role })),
      removeMember: vi.fn(async () => undefined),
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
  await act(async () => {
    root.unmount();
  });
  container.remove();
  vi.clearAllMocks();
});

async function renderPanel() {
  await act(async () => {
    root.render(
      <ToastProvider>
        <AdminPanel locale="en" activeTreeId="tree-1" />
      </ToastProvider>,
    );
    await Promise.resolve();
  });
}

describe("AdminPanel", () => {
  it("edits and removes tree members through the member API", async () => {
    vi.mocked(api.trees.members).mockResolvedValue([member]);
    await renderPanel();

    const role = container.querySelector("#member-role-3") as HTMLSelectElement | null;
    expect(role).not.toBeNull();
    await act(async () => {
      role!.value = "VIEWER";
      role!.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });
    expect(api.trees.updateMember).toHaveBeenCalledWith("tree-1", 3, "VIEWER");

    const remove = container.querySelector('button[aria-label="Remove editor@example.com"]') as HTMLButtonElement | null;
    expect(remove).not.toBeNull();
    await act(async () => {
      remove!.click();
    });
    const confirm = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Remove member");
    expect(confirm).toBeDefined();
    await act(async () => {
      confirm!.click();
      await Promise.resolve();
    });
    expect(api.trees.removeMember).toHaveBeenCalledWith("tree-1", 3);
  });
});
