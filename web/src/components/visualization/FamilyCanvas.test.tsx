import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FamilyCanvas } from "./FamilyCanvas";

vi.mock("../../lib/api", () => ({
  ApiError: class ApiError extends Error {},
  api: {
    analysis: {
      subgraph: vi.fn(async () => ({
        nodes: [{
          id: "a",
          data: {
            given_name_native: "አበበ",
            given_name_latin: "Abebe",
            gender: "MALE",
            full_native: "አበበ",
            full_latin: "Abebe",
            birth_year_ec: 1998,
            death_year_ec: 2016,
            is_deceased: true,
          },
        }],
        edges: [],
      })),
    },
  },
}));

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
  vi.clearAllMocks();
});

describe("FamilyCanvas", () => {
  it("renders readable person cards with life context", async () => {
    await act(async () => {
      root.render(
        <FamilyCanvas
          locale="en"
          treeId="tree-1"
          focusId="a"
          depth={1}
          showParents
          showUnions
          selectedId="a"
          onSelect={() => undefined}
          refreshKey={0}
          retryKey={0}
          fitKey={0}
          onRetry={() => undefined}
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const card = container.querySelector("button")!;
    expect(card.textContent).toContain("Abebe");
    expect(card.textContent).toContain("አበበ");
    expect(card.textContent).toContain("1998 EC - 2016 EC");
    expect(card.textContent).toContain("Deceased");

    const native = Array.from(card.querySelectorAll("span"))
      .find((span) => span.textContent === "አበበ")!;
    expect(native.className).toContain("text-sm");
    expect(native.className).not.toContain("text-muted-foreground");
  });
});
