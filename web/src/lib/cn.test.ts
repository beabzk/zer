import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("joins class names and drops falsy values", () => {
    expect(cn("a", "b")).toBe("a b");
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
    expect(cn()).toBe("");
  });
});
