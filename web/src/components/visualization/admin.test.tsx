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
      signupSettings: vi.fn(async () => ({
        signup_mode: "INVITE",
        default_invite_expiry_hours: 168,
      })),
      updateSignupSettings: vi.fn(async (body: { signup_mode: string; default_invite_expiry_hours: number }) => body),
      invites: vi.fn(async () => []),
      createInvite: vi.fn(async () => ({
        id: "invite-1",
        email: "person@example.com",
        status: "PENDING",
        expires_at: "2026-01-08T00:00:00Z",
        created_at: "2026-01-01T00:00:00Z",
        invite_url: "http://localhost:8080/signup#invite=token",
      })),
      revokeInvite: vi.fn(async () => undefined),
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
        <AdminPanel locale="en" />
      </ToastProvider>,
    );
    await Promise.resolve();
  });
}

describe("AdminPanel", () => {
  it("keeps instance administration separate from tree membership", async () => {
    await renderPanel();

    expect(container.textContent).not.toContain("Tree members");
    expect(api.trees.members).not.toHaveBeenCalled();
  });

  it("updates signup access and creates invitations", async () => {
    await renderPanel();

    const mode = container.querySelector("#signup-mode") as HTMLSelectElement | null;
    expect(mode).not.toBeNull();
    expect(mode?.value).toBe("INVITE");
    await act(async () => {
      mode!.value = "CLOSED";
      mode!.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });

    const expiry = container.querySelector<HTMLInputElement>("#invite-expiry")!;
    const expirySetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    expirySetter?.call(expiry, "72");
    expiry.dispatchEvent(new Event("input", { bubbles: true }));
    await act(async () => {
      const save = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Save access settings");
      save!.click();
      await Promise.resolve();
    });
    expect(api.admin.updateSignupSettings).toHaveBeenCalledWith({
      signup_mode: "CLOSED",
      default_invite_expiry_hours: 72,
    });

    const inviteEmail = container.querySelector<HTMLInputElement>("#invite-email")!;
    const emailSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    emailSetter?.call(inviteEmail, "person@example.com");
    inviteEmail.dispatchEvent(new Event("input", { bubbles: true }));
    await act(async () => {
      const create = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Create invitation");
      create!.click();
      await Promise.resolve();
    });
    expect(api.admin.createInvite).toHaveBeenCalledWith({
      email: "person@example.com",
      expiresInHours: 72,
    });
  });

  it("uses the stored default expiry for new invitations", async () => {
    vi.mocked(api.admin.signupSettings).mockResolvedValueOnce({
      signup_mode: "INVITE",
      default_invite_expiry_hours: 72,
    });
    await renderPanel();

    const expiry = container.querySelector<HTMLInputElement>("#invite-expiry")!;
    expect(expiry.value).toBe("72");

    const inviteEmail = container.querySelector<HTMLInputElement>("#invite-email")!;
    const emailSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    emailSetter?.call(inviteEmail, "person@example.com");
    inviteEmail.dispatchEvent(new Event("input", { bubbles: true }));
    await act(async () => {
      const create = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Create invitation");
      create!.click();
      await Promise.resolve();
    });
    expect(api.admin.createInvite).toHaveBeenCalledWith({
      email: "person@example.com",
      expiresInHours: 72,
    });
  });

  it("rejects invitation emails that signup will reject", async () => {
    await renderPanel();

    const inviteEmail = container.querySelector<HTMLInputElement>("#invite-email")!;
    const emailSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    emailSetter?.call(inviteEmail, "person@example");
    inviteEmail.dispatchEvent(new Event("input", { bubbles: true }));
    await act(async () => {
      const create = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Create invitation");
      create!.click();
      await Promise.resolve();
    });

    expect(api.admin.createInvite).not.toHaveBeenCalled();
    expect(container.querySelector("[role='alert']")?.textContent).toBe("Enter a valid email address, like person@example.com.");
  });
});
