import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./dialog";

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

describe("Dialog", () => {
  it("labels the dialog and keeps focus inside while open", async () => {
    await act(async () => {
      root.render(
        <Dialog open onClose={() => undefined} closeLabel="Close it">
          <DialogTitle>Confirm</DialogTitle>
          <DialogDescription>Confirm this action.</DialogDescription>
          <DialogContent>
            <button type="button" id="last-action">Last action</button>
          </DialogContent>
        </Dialog>,
      );
    });

    const dialog = container.querySelector('[role="dialog"]') as HTMLDivElement;
    const close = container.querySelector('button[aria-label="Close it"]') as HTMLButtonElement;
    const last = container.querySelector("#last-action") as HTMLButtonElement;
    expect(dialog.getAttribute("aria-labelledby")).toBeTruthy();
    expect(dialog.getAttribute("aria-describedby")).toBeTruthy();
    expect(document.activeElement).toBe(close);

    last.focus();
    await act(async () => {
      last.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    });
    expect(document.activeElement).toBe(close);
  });

  it("restores focus to the opener after closing", async () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    await act(async () => {
      root.render(
        <Dialog open onClose={() => undefined}>
          <DialogTitle>Confirm</DialogTitle>
        </Dialog>,
      );
    });
    await act(async () => root.unmount());
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
