import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TabTrigger, Tabs } from "./tabs";

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

describe("Tabs", () => {
  it("uses roving focus and arrow-key selection", async () => {
    const onSelect = vi.fn();
    await act(async () => {
      root.render(
        <Tabs label="Record sections">
          <TabTrigger value="profile" active onSelect={onSelect}>Profile</TabTrigger>
          <TabTrigger value="events" active={false} onSelect={onSelect}>Events</TabTrigger>
        </Tabs>,
      );
    });

    const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1]);
    tabs[0].focus();
    await act(async () => {
      tabs[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    expect(document.activeElement).toBe(tabs[1]);
    expect(onSelect).toHaveBeenCalledWith("events");
  });
});
