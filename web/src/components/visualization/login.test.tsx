import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoginView } from "./LoginView";

vi.mock("../../lib/api", () => ({
  api: {
    auth: {
      config: vi.fn(async () => ({
        setup_required: true,
        signup_mode: null,
        password_enabled: true,
        google_enabled: false,
      })),
    },
    signup: {
      validateInvite: vi.fn(async () => ({
        email: "invited@example.com",
        expires_at: "2030-01-01T00:00:00Z",
      })),
    },
  },
}));

vi.mock("../../lib/auth", () => ({
  auth: {
    signIn: {
      credential: vi.fn(async () => undefined),
      social: vi.fn(async () => undefined),
    },
    signUp: {
      credential: vi.fn(async () => undefined),
    },
  },
}));

const { api } = await import("../../lib/api");
const { auth } = await import("../../lib/auth");

function setInputValue(element: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

function setSelectValue(element: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value")?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

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
  window.location.hash = "";
});

describe("LoginView", () => {
  it("associates credentials with visible labels and submits as a form", async () => {
    await act(async () => {
      root.render(<LoginView locale="en" />);
    });

    expect(container.querySelector('label[for="login-email"]')?.textContent).toBe("Email");
    expect(container.querySelector('label[for="login-password"]')?.textContent).toBe("Password");
    expect(container.querySelector("form")).not.toBeNull();
  });

  it("submits first-run setup with the selected signup mode", async () => {
    await act(async () => {
      root.render(<LoginView locale="en" />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector("h1")?.textContent).toBe("Set up zer");
    const email = container.querySelector<HTMLInputElement>("#login-email")!;
    const password = container.querySelector<HTMLInputElement>("#login-password")!;
    await act(async () => {
      setInputValue(email, "owner@example.com");
      setInputValue(password, "Secret123");
    });
    await act(async () => {
      container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true }));
      await Promise.resolve();
    });

    expect(auth.signUp.credential).toHaveBeenCalledWith({
      email: "owner@example.com",
      password: "Secret123",
      additionalFields: {
        purpose: "instance-setup",
        signupMode: "INVITE",
      },
    });
  });

  it("sends the selected setup mode through Google-only setup", async () => {
    vi.mocked(api.auth.config).mockResolvedValueOnce({
      setup_required: true,
      signup_mode: null,
      password_enabled: false,
      google_enabled: true,
    });

    await act(async () => {
      root.render(<LoginView locale="en" />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const signupMode = container.querySelector<HTMLSelectElement>("#signup-mode")!;
    await act(async () => {
      setSelectValue(signupMode, "OPEN");
    });
    await act(async () => {
      container.querySelector("button")!.click();
      await Promise.resolve();
    });

    expect(auth.signIn.social).toHaveBeenCalledWith({
      provider: "google",
      redirectUri: `${window.location.origin}/signup#setup=OPEN`,
    });
  });

  it("signs up with the invited email and token", async () => {
    vi.mocked(api.auth.config).mockResolvedValueOnce({
      setup_required: false,
      signup_mode: "INVITE",
      password_enabled: true,
      google_enabled: false,
    });
    window.location.hash = "#invite=invite-token";

    await act(async () => {
      root.render(<LoginView locale="en" />);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const email = container.querySelector<HTMLInputElement>("#login-email")!;
    expect(email.value).toBe("invited@example.com");
    expect(email.disabled).toBe(true);
    const password = container.querySelector<HTMLInputElement>("#login-password")!;
    await act(async () => {
      setInputValue(password, "Secret123");
    });
    await act(async () => {
      container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true }));
      await Promise.resolve();
    });

    expect(auth.signIn.credential).not.toHaveBeenCalled();
    expect(auth.signUp.credential).toHaveBeenCalledWith({
      email: "invited@example.com",
      password: "Secret123",
      additionalFields: {
        purpose: "signup",
        inviteToken: "invite-token",
      },
    });
  });

  it("shows password requirements and specific password errors", async () => {
    const callsBefore = vi.mocked(auth.signUp.credential).mock.calls.length;

    await act(async () => {
      root.render(<LoginView locale="en" />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector("#login-password-hint")?.textContent)
      .toBe("Use at least 8 characters, including an uppercase letter and a number.");
    const email = container.querySelector<HTMLInputElement>("#login-email")!;
    const password = container.querySelector<HTMLInputElement>("#login-password")!;
    await act(async () => {
      setInputValue(email, "owner@example.com");
      setInputValue(password, "password1");
    });
    await act(async () => {
      container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector("#login-error")?.textContent)
      .toBe("Password must include an uppercase letter.");

    await act(async () => setInputValue(password, "Password"));
    await act(async () => {
      container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.querySelector("#login-error")?.textContent)
      .toBe("Password must include a number.");

    await act(async () => setInputValue(password, "short"));
    await act(async () => {
      container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.querySelector("#login-error")?.textContent)
      .toBe("Password must be at least 8 characters.");
    expect(vi.mocked(auth.signUp.credential).mock.calls.length).toBe(callsBefore);
  });
});
