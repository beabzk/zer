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
  },
}));

vi.mock("../../lib/auth", () => ({
  auth: {
    signIn: {
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
});
