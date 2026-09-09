import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LoginView } from "./LoginView";

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
});
