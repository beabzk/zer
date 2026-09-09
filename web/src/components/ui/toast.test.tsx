import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ToastProvider, useToast } from "./toast";

function Trigger() {
  const toast = useToast();
  return <button type="button" onClick={() => toast.push({ title: "Failed", variant: "destructive" })}>Trigger</button>;
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

describe("ToastProvider", () => {
  it("announces destructive notifications as alerts", async () => {
    await act(async () => root.render(<ToastProvider><Trigger /></ToastProvider>));
    await act(async () => (container.querySelector("button") as HTMLButtonElement).click());
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Failed");
  });
});
