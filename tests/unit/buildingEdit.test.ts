import { expect, test } from "bun:test";
import type { BuildingInfo } from "../../packages/core/src/map/building";
import { planBuildingEdit, type BuildingEditOp } from "../../packages/core/src/map/applyBuildingEdit";
import { WORLD_ITEM_TILES } from "../../packages/core/src/map/geometry";
import { ctxOf, emptyMap, rawOf } from "./mapFixture";

const bld = (type: number, x: number, y: number, over: Partial<BuildingInfo> = {}): BuildingInfo => ({ type, x, y, angle: 0, bit: 0, subType: 0, typeArg: 0, uniqueId: 0, ...over });
const op = (changes: BuildingEditOp["changes"], plaza?: BuildingEditOp["plaza"]): BuildingEditOp => ({ op: "buildingEdit", label: "t", changes, ...(plaza ? { plaza } : {}) });
// World y of the item area starts at 32 in the fixture (origin x = 0).
function setup() {
  const map = emptyMap();
  map.buildings[2] = bld(21, 100, 100, { uniqueId: 7 });
  map.buildings[3] = bld(9, 140, 100, { uniqueId: 8 });
  map.plaza = { x: 200, z: 100 };
  return { map, ctx: ctxOf(map) };
}

test("moving a building 4 tiles right changes only its position", () => {
  const { ctx } = setup();
  const plan = planBuildingEdit(ctx, op([{ slot: 2, building: bld(21, 104, 100, { uniqueId: 7 }) }]));
  expect(plan.buildings[2]!.x).toBe(104);
  expect(plan.buildings[3]).toEqual(ctx.map.buildings[3]!);
  expect(plan.plaza).toEqual({ x: 200, z: 100 });
  expect(ctx.map.buildings[2]!.x).toBe(100);
});

test("overlap with a building or the plaza is refused with the slot", () => {
  const { ctx } = setup();
  expect(() => planBuildingEdit(ctx, op([{ slot: 10, building: bld(5, 102, 102, { uniqueId: 1 }) }]))).toThrow("overlaps building in slot 2");
  expect(() => planBuildingEdit(ctx, op([{ slot: 10, building: bld(5, 210, 105, { uniqueId: 1 }) }]))).toThrow("overlaps the plaza");
});

test("footprints outside the item area are refused", () => {
  const { ctx } = setup();
  expect(() => planBuildingEdit(ctx, op([{ slot: 10, building: bld(5, WORLD_ITEM_TILES.w - 2, 100, { uniqueId: 1 }) }]))).toThrow("outside the item area");
  expect(() => planBuildingEdit(ctx, op([], { x: 280, z: 100 }))).toThrow("outside the item area");
});

test("items under the footprint (including extension tiles) are refused with a count", () => {
  const { map, ctx } = setup();
  const l = map.items[1]!;
  l.raw[l.height * 61 + 70] = 0x123n; // world (61, 102)
  l.raw[l.height * 61 + 71] = rawOf(0xfffd, 0);
  expect(() => planBuildingEdit(ctx, op([{ slot: 10, building: bld(5, 60, 100, { uniqueId: 1 }) }]))).toThrow("overlaps 2 items");
});

test("water refuses ordinary buildings and the plaza, not bridges or inclines", () => {
  const { map, ctx } = setup();
  map.terrain.unitModel.fill(1);
  expect(() => planBuildingEdit(ctx, op([{ slot: 10, building: bld(5, 60, 100, { uniqueId: 1 }) }]))).toThrow("water");
  expect(() => planBuildingEdit(ctx, op([], { x: 60, z: 100 }))).toThrow("water");
  expect(planBuildingEdit(ctx, op([{ slot: 10, building: bld(26, 60, 100, { uniqueId: 1 }) }])).buildings[10]!.type).toBe(26);
  expect(planBuildingEdit(ctx, op([{ slot: 10, building: bld(27, 60, 100, { uniqueId: 1 }) }])).buildings[10]!.type).toBe(27);
});

test("field rules", () => {
  const { ctx } = setup();
  const add = (b: BuildingInfo, slot = 10) => () => planBuildingEdit(ctx, op([{ slot, building: b }]));
  expect(add(bld(30, 60, 100, { uniqueId: 1 }))).toThrow("unknown building type 30");
  expect(add(bld(5, 60, 100, { angle: 4, uniqueId: 1 }))).toThrow("angle must be 0-3");
  expect(add(bld(5, 60, 100, { uniqueId: 7 }))).toThrow("uniqueId 7 is already used by slot 2");
  expect(add(bld(21, 60, 100, { uniqueId: 1 }))).toThrow("already used by slot 2");
  expect(planBuildingEdit(ctx, op([{ slot: 10, building: bld(26, 60, 100, { uniqueId: 1 }) }, { slot: 11, building: bld(26, 70, 100, { uniqueId: 2 }) }])).buildings[11]!.type).toBe(26);
  expect(add(bld(5, 1.5, 100))).toThrow(RangeError);
  expect(add(bld(5, 65536, 100))).toThrow(RangeError);
  expect(add(bld(5, 60, 100, { typeArg: 256, uniqueId: 1 }))).toThrow(RangeError);
  expect(add(bld(5, 60, 100, { bit: 128, uniqueId: 1 }))).toThrow(RangeError);
});

test("uniqueId 0 is exempt from uniqueness", () => {
  const { ctx } = setup();
  const p = planBuildingEdit(ctx, op([{ slot: 10, building: bld(5, 60, 100, { uniqueId: 0 }) }, { slot: 11, building: bld(6, 70, 100, { uniqueId: 0 }) }]));
  expect(p.buildings[11]!.uniqueId).toBe(0);
});

test("swapping two positions in one op is accepted (final-state validation)", () => {
  const { ctx } = setup();
  const p = planBuildingEdit(ctx, op([{ slot: 2, building: bld(21, 140, 100, { uniqueId: 7 }) }, { slot: 3, building: bld(9, 100, 100, { uniqueId: 8 }) }]));
  expect([p.buildings[2]!.x, p.buildings[3]!.x]).toEqual([140, 100]);
});

test("slot twice or out of range is refused", () => {
  const { ctx } = setup();
  const b = bld(5, 60, 100, { uniqueId: 1 });
  expect(() => planBuildingEdit(ctx, op([{ slot: 2, building: b }, { slot: 2, building: b }]))).toThrow("slot 2 appears twice");
  expect(() => planBuildingEdit(ctx, op([{ slot: 46, building: b }]))).toThrow("slot must be 0-45");
  expect(() => planBuildingEdit(ctx, op([{ slot: -1, building: b }]))).toThrow("slot must be 0-45");
});

test("clearing zeroes every field", () => {
  const { ctx } = setup();
  const p = planBuildingEdit(ctx, op([{ slot: 2, building: bld(0, 100, 100, { angle: 2, subType: 9, uniqueId: 7 }) }]));
  expect(p.buildings[2]).toEqual(bld(0, 0, 0));
});

test("a save that already breaks a rule does not block unrelated edits", () => {
  const { map, ctx } = setup();
  map.buildings[1] = bld(23, 102, 102, { uniqueId: 3 }); // overlaps slot 2
  expect(planBuildingEdit(ctx, op([{ slot: 3, building: bld(9, 160, 100, { uniqueId: 8 }) }])).buildings[3]!.x).toBe(160);
  expect(() => planBuildingEdit(ctx, op([{ slot: 1, building: bld(23, 103, 102, { uniqueId: 3 }) }]))).toThrow("overlaps building in slot 2");
});

test("a field-only edit of an entry that stands over items is not refused", () => {
  const { map, ctx } = setup();
  const l = map.items[1]!;
  l.raw[l.height * 101 + 70] = 0x123n; // under slot 2
  const p = planBuildingEdit(ctx, op([{ slot: 2, building: bld(21, 100, 100, { uniqueId: 7, subType: 5 }) }]));
  expect(p.buildings[2]!.subType).toBe(5);
});

test("resident services (type 23) may stand inside the plaza", () => {
  const { ctx } = setup();
  expect(planBuildingEdit(ctx, op([{ slot: 10, building: bld(23, 205, 105, { uniqueId: 1 }) }])).buildings[10]!.type).toBe(23);
});

test("the plan never touches the source map", () => {
  const { map, ctx } = setup();
  const before = JSON.stringify(map.buildings);
  try { planBuildingEdit(ctx, op([{ slot: 2, building: bld(5, 140, 100) }])); } catch {}
  planBuildingEdit(ctx, op([{ slot: 2, building: bld(21, 104, 100, { uniqueId: 7 }) }]));
  expect(JSON.stringify(map.buildings)).toBe(before);
});
