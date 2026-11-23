import { expect, test } from "bun:test";
import type { BuildingInfo } from "../../packages/core/src/map/building";
import { addOp, deleteOp, fieldOp, freeSlots, hitTarget, moveOp, parseField, reconcileSelection, targetRect } from "../../app/src/map/buildingTool";
import { emptyMap } from "./mapFixture";

const bld = (type: number, x: number, y: number, over: Partial<BuildingInfo> = {}): BuildingInfo => ({ type, x, y, angle: 0, bit: 0, subType: 0, typeArg: 0, uniqueId: 0, ...over });
// Fixture: origin x 0, y 32 (item tile y = world y - 32). Slot 2 at world (100,100) = item (100,68). Plaza at world (102,102) overlaps it.
function map() {
  const m = emptyMap();
  m.buildings[2] = bld(21, 100, 100, { angle: 1, bit: 3, subType: 4, typeArg: 5, uniqueId: 7 });
  m.plaza = { x: 102, z: 102 };
  return m;
}

test("hitTarget finds slot 2 on its 4x4 corners and nothing just outside", () => {
  const m = map();
  for (const [x, y] of [[100, 68], [103, 68], [100, 71], [103, 71]]) expect(hitTarget(m, 9, { x: x!, y: y! })).toEqual({ kind: "building", slot: 2 });
  expect(hitTarget(m, 9, { x: 99, y: 68 })).toBeNull();
  expect(hitTarget(m, 9, { x: 100, y: 72 })).toBeNull();
});

test("hitTarget finds the plaza on its 24x20 area and buildings win where they overlap", () => {
  const m = map();
  expect(hitTarget(m, 9, { x: 102, y: 102 - 32 + 19 })).toEqual({ kind: "plaza" });
  expect(hitTarget(m, 9, { x: 102 + 23, y: 102 - 32 })).toEqual({ kind: "plaza" });
  expect(hitTarget(m, 9, { x: 102 + 24, y: 102 - 32 })).toBeNull();
  expect(hitTarget(m, 9, { x: 102, y: 70 })).toEqual({ kind: "building", slot: 2 }); // inside both
});

test("empty slots are ignored by hit-testing", () => {
  const m = emptyMap();
  m.plaza = { x: 200, z: 200 };
  expect(hitTarget(m, 9, { x: 0, y: 0 })).toBeNull(); // empty slots sit at world (0,0)
});

test("targetRect is in item-layer coordinates", () => {
  const m = map();
  expect(targetRect(m, 9, { kind: "building", slot: 2 })).toEqual({ x: 100, y: 68, w: 4, h: 4 });
  expect(targetRect(m, 9, { kind: "plaza" })).toEqual({ x: 102, y: 70, w: 24, h: 20 });
});

test("moveOp changes only x and y of a building; item coords convert to world", () => {
  const m = map();
  const op = moveOp(m, 9, { kind: "building", slot: 2 }, { x: 110, y: 50 });
  expect(op.changes).toEqual([{ slot: 2, building: { ...m.buildings[2]!, x: 110, y: 82 } }]);
  expect(op.plaza).toBeUndefined();
});

test("moveOp of the plaza sets plaza and no changes", () => {
  const op = moveOp(map(), 9, { kind: "plaza" }, { x: 20, y: 10 });
  expect(op.plaza).toEqual({ x: 20, z: 42 });
  expect(op.changes).toEqual([]);
});

test("addOp picks the first empty slot and the smallest unused uniqueId >= 1", () => {
  const m = map();
  m.buildings[0] = bld(1, 10, 10, { uniqueId: 1 });
  m.buildings[1] = bld(3, 20, 20, { uniqueId: 2 });
  const op = addOp(m, 9, 12, { x: 50, y: 40 })!;
  expect(op.changes).toEqual([{ slot: 3, building: bld(12, 50, 72, { uniqueId: 3 }) }]);
});

test("addOp returns null when all 46 slots are in use and freeSlots counts empties", () => {
  const m = emptyMap();
  expect(freeSlots(m)).toBe(46);
  m.buildings.forEach((_, i) => (m.buildings[i] = bld(26, i, 0, { uniqueId: i + 1 })));
  expect(freeSlots(m)).toBe(0);
  expect(addOp(m, 9, 26, { x: 1, y: 1 })).toBeNull();
});

test("deleteOp yields a type 0 building and fieldOp patches one field", () => {
  const m = map();
  expect(deleteOp(m, 2).changes[0]!.building.type).toBe(0);
  const f = fieldOp(m, 2, { subType: 9 });
  expect(f.changes[0]!.building).toEqual({ ...m.buildings[2]!, subType: 9 });
});

test("reconcileSelection keeps live buildings and the plaza, drops empty slots", () => {
  const m = map();
  expect(reconcileSelection(m, { kind: "building", slot: 2 })).toEqual({ kind: "building", slot: 2 });
  expect(reconcileSelection(m, { kind: "plaza" })).toEqual({ kind: "plaza" });
  expect(reconcileSelection(m, { kind: "building", slot: 5 })).toBeNull();
  expect(reconcileSelection(m, { kind: "building", slot: 999 })).toBeNull();
  expect(reconcileSelection(m, null)).toBeNull();
});

test("parseField refuses blank and non-numeric input instead of reading it as 0", () => {
  expect(parseField("12")).toBe(12);
  expect(parseField("0")).toBe(0);
  expect(parseField("-3")).toBe(-3);
  expect(parseField("")).toBeNull();
  expect(parseField("   ")).toBeNull();
  expect(parseField("abc")).toBeNull();
});
