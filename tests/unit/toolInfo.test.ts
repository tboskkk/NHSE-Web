import { expect, test } from "bun:test";
import { TOOL_INFO, toolForKey, usesLayer } from "../../app/src/map/tools";

test("every tool is described once, with a unique hotkey", () => {
  expect(TOOL_INFO.map((t) => t.id).sort()).toEqual(["building", "clearRect", "erase", "eyedropper", "place", "rect", "terrain"]);
  const keys = TOOL_INFO.map((t) => t.key);
  expect(new Set(keys).size).toBe(keys.length);
});

test("the old hotkeys still pick the same tools", () => {
  const old = { p: "place", e: "erase", r: "rect", c: "clearRect", i: "eyedropper", b: "building", t: "terrain" } as const;
  for (const [k, tool] of Object.entries(old)) {
    expect(toolForKey(k)).toBe(tool);
    expect(toolForKey(k.toUpperCase())).toBe(tool);
  }
  expect(toolForKey("z")).toBeNull();
});

test("only the item tools use the item layer chooser", () => {
  for (const t of ["place", "erase", "rect", "clearRect", "eyedropper"] as const) expect(usesLayer(t)).toBe(true);
  expect(usesLayer("building")).toBe(false);
  expect(usesLayer("terrain")).toBe(false);
});

test("tools are grouped items, structures, terrain in toolbar order", () => {
  expect(TOOL_INFO.map((t) => t.group)).toEqual(["items", "items", "items", "items", "items", "structures", "terrain"]);
});
