import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PeopleDirectory } from "./PeopleDirectory";
import type { PersonHit } from "../../lib/api";

const people: PersonHit[] = [
  {
    id: "a",
    full_native: "አበበ",
    full_latin: "Abebe",
    gender: "MALE",
    birth_year_ec: 1998,
    death_year_ec: 2016,
    is_deceased: true,
  },
  {
    id: "b",
    full_native: "አስቴር",
    full_latin: "Aster",
    gender: "FEMALE",
    birth_year_ec: 2000,
    is_deceased: false,
  },
];

vi.mock("../../lib/api", () => ({
  ApiError: class ApiError extends Error {},
  api: {
    individuals: {
      list: vi.fn(async () => ({ individuals: people, total: 21, limit: 24, offset: 0 })),
    },
  },
}));

const { api } = await import("../../lib/api");

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("PeopleDirectory", () => {
  it("uses a 24-person page and renders life context", async () => {
    await act(async () => {
      root.render(
        <PeopleDirectory locale="en" treeId="tree-1" onAdd={() => undefined} onSelect={() => undefined} />,
      );
    });
    await act(async () => {
      vi.advanceTimersByTime(180);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(api.individuals.list).toHaveBeenCalledWith("tree-1", undefined, {
      limit: 24,
      offset: 0,
      order: "created",
      gender: undefined,
      deceased: undefined,
    });

    const cards = Array.from(container.querySelectorAll('[role="option"]'));
    expect(cards[0].textContent).toContain("1998 EC - 2016 EC");
    expect(cards[0].textContent).toContain("Deceased");
    expect(cards[0].textContent).toContain("Male");
    expect(cards[1].textContent).toContain("2000 EC");
    expect(cards[1].textContent).toContain("Living");
    expect(cards[1].textContent).toContain("Female");
    expect(container.textContent).not.toContain("MALE");
    expect(container.textContent).not.toContain("FEMALE");
  });
});
