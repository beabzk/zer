import { describe, expect, it } from "vitest";
import {
  lastFocusKey,
  parseLocation,
  pathForView,
  treeIdFromPath,
  viewFromPath,
  viewNeedsFocus,
} from "./navigation";

describe("parseLocation", () => {
  it("parses tree routes into view and tree id", () => {
    expect(parseLocation("/tree/abc123/overview")).toEqual({ view: "overview", treeId: "abc123" });
    expect(parseLocation("/tree/abc123/graph")).toEqual({ view: "canvas", treeId: "abc123" });
    expect(parseLocation("/tree/abc123/lineage")).toEqual({ view: "pedigree", treeId: "abc123" });
    expect(parseLocation("/tree/abc123/kinship")).toEqual({ view: "kinship", treeId: "abc123" });
    expect(parseLocation("/tree/abc123/members")).toEqual({ view: "members", treeId: "abc123" });
  });

  it("parses global routes without a tree id", () => {
    expect(parseLocation("/admin")).toEqual({ view: "admin", treeId: "" });
    expect(parseLocation("/overview")).toEqual({ view: "overview", treeId: "" });
    expect(parseLocation("/")).toEqual({ view: "overview", treeId: "" });
  });

  it("falls back to overview for unknown slugs", () => {
    expect(parseLocation("/tree/abc123/unknown")).toEqual({ view: "overview", treeId: "" });
    expect(parseLocation("/nope")).toEqual({ view: "overview", treeId: "" });
  });

  it("decodes encoded tree ids", () => {
    expect(parseLocation("/tree/a%20b/people")).toEqual({ view: "people", treeId: "a b" });
  });
});

describe("pathForView", () => {
  it("mirrors the tree id in workspace routes and drops it for admin", () => {
    expect(pathForView("overview", "t1")).toBe("/tree/t1/overview");
    expect(pathForView("canvas", "t1")).toBe("/tree/t1/graph");
    expect(pathForView("members", "t1")).toBe("/tree/t1/members");
    expect(pathForView("admin", "t1")).toBe("/admin");
    expect(pathForView("overview", "")).toBe("/overview");
  });

  it("round-trips through parseLocation", () => {
    for (const view of ["overview", "people", "canvas", "pedigree", "cards", "kinship", "members"] as const) {
      expect(parseLocation(pathForView(view, "tree-9"))).toEqual({ view, treeId: "tree-9" });
    }
  });
});

describe("view helpers", () => {
  it("marks graph views as needing focus", () => {
    expect(viewNeedsFocus("canvas")).toBe(true);
    expect(viewNeedsFocus("pedigree")).toBe(true);
    expect(viewNeedsFocus("cards")).toBe(true);
    expect(viewNeedsFocus("overview")).toBe(false);
    expect(viewNeedsFocus("people")).toBe(false);
    expect(viewNeedsFocus("kinship")).toBe(false);
    expect(viewNeedsFocus("members")).toBe(false);
  });

  it("reads the current address bar by default", () => {
    window.history.replaceState({}, "", "/tree/t7/kinship");
    expect(viewFromPath()).toBe("kinship");
    expect(treeIdFromPath()).toBe("t7");
    window.history.replaceState({}, "", "/");
  });

  it("scopes the continue-exploring key per tree", () => {
    expect(lastFocusKey("a")).toBe("zer-last-focus-a");
    expect(lastFocusKey("a")).not.toBe(lastFocusKey("b"));
  });
});
