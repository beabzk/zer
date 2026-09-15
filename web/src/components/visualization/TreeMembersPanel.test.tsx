import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TreeMembersPanel } from "./TreeMembersPanel";
import { ToastProvider } from "../ui";
import type { TreeInvitation, TreeMember } from "../../lib/api";

const members: TreeMember[] = [
  {
    tree_id: "tree-1",
    user_id: 1,
    role: "OWNER",
    email: "owner@example.com",
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    tree_id: "tree-1",
    user_id: 2,
    role: "EDITOR",
    email: "editor@example.com",
    created_at: "2026-01-02T00:00:00Z",
  },
];

const invitations: TreeInvitation[] = [
  {
    id: "pending-invitation",
    tree_id: "tree-1",
    email: "pending@example.com",
    role: "EDITOR",
    status: "PENDING",
    expires_at: "2026-01-08T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "accepted-invitation",
    tree_id: "tree-1",
    email: "accepted@example.com",
    role: "VIEWER",
    status: "ACCEPTED",
    expires_at: "2026-01-08T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    accepted_at: "2026-01-02T00:00:00Z",
  },
];

vi.mock("../../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/api")>()),
  api: {
    trees: {
      members: vi.fn(async () => members),
      invitations: vi.fn(async () => []),
      createInvitation: vi.fn(async () => ({
        id: "invitation-1",
        tree_id: "tree-1",
        email: "person@example.com",
        role: "EDITOR",
        status: "PENDING",
        expires_at: "2026-01-08T00:00:00Z",
        created_at: "2026-01-01T00:00:00Z",
        invite_url: "http://localhost:8080/tree-invite#invite=token",
      })),
      updateMember: vi.fn(async (_treeId: string, _userId: number, role: TreeMember["role"]) => ({
        ...members[1],
        role,
      })),
      revokeInvitation: vi.fn(async () => undefined),
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
  vi.mocked(api.trees.members).mockResolvedValue(members);
  vi.mocked(api.trees.invitations).mockResolvedValue(invitations);
  vi.mocked(api.trees.createInvitation).mockResolvedValue({
    id: "invitation-1",
    tree_id: "tree-1",
    email: "person@example.com",
    role: "EDITOR",
    status: "PENDING",
    expires_at: "2026-01-08T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    invite_url: "http://localhost:8080/tree-invite#invite=token",
  });
  vi.mocked(api.trees.updateMember).mockImplementation(async (_treeId, _userId, role) => ({
    ...members[1],
    role,
  }));
  vi.mocked(api.trees.revokeInvitation).mockResolvedValue(undefined);
  vi.mocked(api.trees.removeMember).mockResolvedValue(undefined);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  vi.clearAllMocks();
});

async function renderPanel(callerRole: "OWNER" | "ADMIN" = "OWNER") {
  await act(async () => {
    root.render(
      <ToastProvider>
        <TreeMembersPanel locale="en" treeId="tree-1" treeName="Demo" callerRole={callerRole} />
      </ToastProvider>,
    );
    await Promise.resolve();
  });
}

describe("TreeMembersPanel", () => {
  it("shows only pending invitations in the active invitation table", async () => {
    await renderPanel();

    expect(container.textContent).toContain("pending@example.com");
    expect(container.textContent).not.toContain("accepted@example.com");
  });

  it("formats member and invitation dates without raw database timestamps", async () => {
    await renderPanel();

    const ownerRow = Array.from(container.querySelectorAll("tr"))
      .find((row) => row.textContent?.includes("owner@example.com"))!;
    expect(ownerRow.cells[2].textContent).toBe("Jan 1, 2026");

    const invitationRow = Array.from(container.querySelectorAll("tr"))
      .find((row) => row.textContent?.includes("pending@example.com"))!;
    expect(invitationRow.cells[3].textContent).toBe("Jan 8, 2026");
  });

  it("offers human-readable invitation expiry choices", async () => {
    await renderPanel();

    const expiry = container.querySelector<HTMLSelectElement>("#invite-expiry")!;
    expect(expiry.value).toBe("168");
    expect(Array.from(expiry.options).map((option) => option.textContent)).toEqual([
      "24 hours",
      "7 days",
      "30 days",
    ]);
  });

  it("renders one role label for a member row", async () => {
    await renderPanel();

    const ownerRow = Array.from(container.querySelectorAll("tr"))
      .find((row) => row.textContent?.includes("owner@example.com"))!;
    expect(ownerRow.textContent?.match(/Owner/g)).toHaveLength(1);
  });

  it("protects the sole owner from removal", async () => {
    await renderPanel();

    expect(container.querySelector('button[aria-label="Remove owner@example.com"]')).toBeNull();
    expect(container.textContent).toContain("Protected");
  });

  it("warns when removing one of multiple owners", async () => {
    const multipleOwners: TreeMember[] = [
      members[0],
      { ...members[0], user_id: 3, email: "second-owner@example.com" },
    ];
    vi.mocked(api.trees.members).mockResolvedValue(multipleOwners);
    await renderPanel();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="Remove second-owner@example.com"]')!.click();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("This is one of multiple owners. Removing them leaves every remaining owner in place.");
  });

  it("creates a pending invitation for an existing account by email", async () => {
    await renderPanel();

    const email = container.querySelector<HTMLInputElement>("#invite-email")!;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    setter?.call(email, "person@example.com");
    email.dispatchEvent(new Event("input", { bubbles: true }));
    await act(async () => {
      const create = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Send invitation");
      create!.click();
      await Promise.resolve();
    });

    expect(api.trees.createInvitation).toHaveBeenCalledWith("tree-1", {
      email: "person@example.com",
      role: "EDITOR",
      expiresInHours: 168,
    });
    expect(container.querySelector("a")?.getAttribute("href")).toBe("http://localhost:8080/tree-invite#invite=token");
  });

  it("rejects an invalid invitation email before calling the API", async () => {
    await renderPanel();

    const email = container.querySelector<HTMLInputElement>("#invite-email")!;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    setter?.call(email, "person@example");
    email.dispatchEvent(new Event("input", { bubbles: true }));
    await act(async () => {
      const create = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Send invitation");
      create!.click();
      await Promise.resolve();
    });

    expect(api.trees.createInvitation).not.toHaveBeenCalled();
    expect(container.querySelector("#invite-email-error")?.textContent).toBe("Enter a valid email address, like person@example.com.");
  });

  it("lets an owner promote an existing member", async () => {
    await renderPanel();

    const role = container.querySelector<HTMLSelectElement>("#member-role-2")!;
    await act(async () => {
      role.value = "OWNER";
      role.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });

    expect(api.trees.updateMember).toHaveBeenCalledWith("tree-1", 2, "OWNER");
  });

  it("prevents a tree admin from changing an owner", async () => {
    await renderPanel("ADMIN");

    const ownerRole = container.querySelector<HTMLSelectElement>("#member-role-1")!;
    const editorRole = container.querySelector<HTMLSelectElement>("#member-role-2")!;
    const removeEditor = container.querySelector('button[aria-label="Remove editor@example.com"]') as HTMLButtonElement;

    expect(ownerRole.disabled).toBe(true);
    expect(container.querySelector('button[aria-label="Remove owner@example.com"]')).toBeNull();
    expect(editorRole.disabled).toBe(false);
    expect(removeEditor.disabled).toBe(false);
  });
});
