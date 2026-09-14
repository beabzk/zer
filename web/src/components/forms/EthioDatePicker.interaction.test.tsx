import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EthioDatePicker, type EthioDate } from "./EthioDatePicker";

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

function DateForm({ initial }: { initial: EthioDate }) {
  const [date, setDate] = useState(initial);
  return <><EthioDatePicker locale="en" value={date} onChange={setDate} /><output>{JSON.stringify(date)}</output></>;
}

describe("partial Ethiopian dates", () => {
  it("leaves month and day visibly unset for a year-only date", async () => {
    await act(async () => root.render(<DateForm initial={{ year: 1998 }} />));
    const month = container.querySelector<HTMLSelectElement>("select")!;
    expect(month.value).toBe("");
    expect(month.selectedOptions[0].textContent).toBe("Month");
    expect(container.querySelector<HTMLInputElement>('[aria-label="Day"]')!.value).toBe("");
    expect(container.querySelector("output")!.textContent).toBe('{"year":1998}');
  });

  it("can return from a complete date to a year-only date without retaining a hidden day", async () => {
    await act(async () => root.render(<DateForm initial={{ year: 1998, month: 4, day: 16 }} />));
    const month = container.querySelector<HTMLSelectElement>("select")!;
    await act(async () => {
      month.value = "";
      month.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(container.querySelector("output")!.textContent).toBe('{"year":1998}');
  });

  it("does not silently keep an impossible day when switching to Pagume", async () => {
    await act(async () => root.render(<DateForm initial={{ year: 1998, month: 4, day: 16 }} />));
    const month = container.querySelector<HTMLSelectElement>("select")!;
    await act(async () => {
      month.value = "13";
      month.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(container.querySelector("output")!.textContent).toBe('{"year":1998,"month":13}');
  });
});
