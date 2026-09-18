import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FamilyCanvas } from "./FamilyCanvas";

const { subgraph } = vi.hoisted(() => ({ subgraph: vi.fn() }));

vi.mock("../../lib/api", () => ({
  ApiError: class ApiError extends Error {},
  api: { analysis: { subgraph } },
}));

const person = (id: string, latin: string, native: string) => ({
  id,
  data: {
    given_name_native: native,
    given_name_latin: latin,
    gender: "MALE",
    full_native: native,
    full_latin: latin,
    birth_year_ec: 1998,
    is_deceased: false,
  },
});

const parentEdge = (id: string, source: string, target: string) => ({ id, source, target, label: "parent" });
const unionEdge = (id: string, source: string, target: string) => ({ id, source, target, label: "union" });

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  subgraph.mockReset();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

async function renderCanvas(props: Partial<Parameters<typeof FamilyCanvas>[0]> = {}) {
  await act(async () => {
    root.render(
      <FamilyCanvas
        locale="en"
        treeId="tree-1"
        focusId="a"
        depth={2}
        showParents
        showUnions
        selectedId=""
        onSelect={() => undefined}
        refreshKey={0}
        retryKey={0}
        fitKey={0}
        onRetry={() => undefined}
        {...props}
      />,
    );
    await Promise.resolve();
    await Promise.resolve();
  });
}

const cards = () => Array.from(container.querySelectorAll("button"));
const card = (name: string) => cards().find((item) => item.textContent?.includes(name))!;
const highlighted = () => Array.from(container.querySelectorAll('path[stroke="var(--accent-strong)"]'));
const status = () => container.querySelector('[role="status"]')!.textContent ?? "";

describe("FamilyCanvas", () => {
  it("renders readable person cards with life context", async () => {
    subgraph.mockResolvedValue({
      nodes: [person("a", "Abebe", "አበበ")],
      edges: [],
    });
    await renderCanvas({ selectedId: "a" });

    const item = card("Abebe");
    expect(item.textContent).toContain("Abebe");
    expect(item.textContent).toContain("አበበ");
    expect(item.textContent).toContain("1998 EC");
    expect(item.textContent).toContain("Living");

    const native = Array.from(item.querySelectorAll("span")).find((span) => span.textContent === "አበበ")!;
    expect(native.className).toContain("text-sm");
    expect(native.className).not.toContain("text-muted-foreground");
  });

  it("highlights links and dims unrelated people on selection", async () => {
    subgraph.mockResolvedValue({
      nodes: [person("a", "Abebe", "አበበ"), person("b", "Belete", "በለጠ"), person("c", "Cherenet", "ቸረነት")],
      edges: [parentEdge("e1", "a", "b")],
    });
    await renderCanvas({ selectedId: "a" });

    expect(highlighted()).toHaveLength(1);
    expect(card("Cherenet").className).toContain("opacity-40");
    expect(card("Abebe").className).not.toContain("opacity-40");
    expect(card("Abebe").className).toContain("border-2 border-accent");
    expect(card("Belete").className).toContain("border-accent/80");
    expect(status()).toContain("Abebe is the parent of Belete");
  });

  it("highlights direct links and dims unrelated people on hover", async () => {
    subgraph.mockResolvedValue({
      nodes: [person("a", "Abebe", "አበበ"), person("b", "Belete", "በለጠ"), person("c", "Cherenet", "ቸረነት")],
      edges: [parentEdge("e1", "a", "b")],
    });
    await renderCanvas();
    expect(highlighted()).toHaveLength(0);

    await act(async () => {
      card("Abebe").dispatchEvent(new MouseEvent("mouseover", { bubbles: true, relatedTarget: document.body }));
    });

    expect(highlighted()).toHaveLength(1);
    expect(highlighted()[0].getAttribute("d")).toContain("M");
    expect(card("Cherenet").className).toContain("opacity-40");
    expect(card("Abebe").className).not.toContain("opacity-40");
    expect(status()).toContain("Abebe is the parent of Belete");

    await act(async () => {
      card("Abebe").dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body }));
    });
    expect(highlighted()).toHaveLength(0);
  });

  it("applies the same highlighting for keyboard focus", async () => {
    subgraph.mockResolvedValue({
      nodes: [person("a", "Abebe", "አበበ"), person("b", "Belete", "በለጠ"), person("c", "Cherenet", "ቸረነት")],
      edges: [parentEdge("e1", "a", "b")],
    });
    await renderCanvas();

    await act(async () => card("Belete").focus());

    expect(highlighted()).toHaveLength(1);
    expect(card("Cherenet").className).toContain("opacity-40");
    expect(status()).toContain("Abebe is the parent of Belete");

    await act(async () => card("Belete").blur());
    expect(highlighted()).toHaveLength(0);
  });

  it("lists union links for the active person", async () => {
    subgraph.mockResolvedValue({
      nodes: [person("a", "Abebe", "አበበ"), person("b", "Belete", "በለጠ")],
      edges: [unionEdge("u1", "a", "b")],
    });
    await renderCanvas({ selectedId: "a" });

    expect(highlighted()).toHaveLength(1);
    expect(highlighted()[0].getAttribute("stroke-width")).toBe("3");
    expect(status()).toContain("Abebe is the partner of Belete");
  });
});
