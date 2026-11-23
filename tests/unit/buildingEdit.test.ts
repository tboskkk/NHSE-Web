import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applyOp, describeOp, validateOp, type EditOp } from "../../packages/core/src/edit/ops";
import { EditSession } from "../../packages/core/src/edit/session";
import { readMap } from "../../packages/core/src/map/mapData";
import { HorizonSave } from "../../packages/core/src/save/horizonSave";
import { goldenTest, hash, readDir, REPO, SAVE } from "../golden/helpers";
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

// ---- Task 3: as an EditOp against a real save ----
const acreTiles = () => new Uint8Array(readFileSync(join(REPO, "app/public/data/acretiles.bin")));
async function real() {
  const sav = await HorizonSave.load(readDir(SAVE!));
  const map = readMap(sav.main.data, sav.revision);
  const ctx = { map, acreTiles: acreTiles() };
  const free = (slot: number, make: (x: number, y: number) => BuildingInfo): { x: number; y: number } => {
    for (let x = 100; x < 260; x += 2)
      for (let y = 60; y < 200; y += 2)
        try { planBuildingEdit(ctx, op([{ slot, building: make(x, y) }])); return { x, y }; } catch { /* occupied */ }
    throw new Error("no free spot");
  };
  return { sav, map, ctx, free, env: { acreTiles: acreTiles() } };
}
const diffOffsets = (a: Uint8Array, b: Uint8Array) => {
  const out: number[] = [];
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) out.push(i);
  return out;
};
const slotOff = (sav: HorizonSave, slot: number) => sav.revision.mainOffsets.mainFieldStructure + slot * 0x14;
const plazaOff = (sav: HorizonSave) => sav.revision.mainOffsets.outsideField + 72 * 2 + 4;

goldenTest("buildingEdit move changes exactly the x/y bytes; describeOp is the label", async () => {
  const { sav, map, free, env } = await real();
  const b = map.buildings[5]!;
  const to = free(5, (x, y) => ({ ...b, x, y }));
  const before = sav.main.data.slice();
  const e = op([{ slot: 5, building: { ...b, ...to } }]);
  expect(describeOp(sav, undefined as never, e)).toBe("t");
  applyOp(sav, e, env);
  const o = slotOff(sav, 5);
  const changed = diffOffsets(before, sav.main.data);
  expect(changed.length).toBeGreaterThan(0);
  expect(changed.every((i) => i >= o + 2 && i < o + 6)).toBe(true);
  const dv = new DataView(sav.main.data.buffer, sav.main.data.byteOffset);
  expect([dv.getUint16(o + 2, true), dv.getUint16(o + 4, true)]).toEqual([to.x, to.y]);
});

goldenTest("buildingEdit retype preserves the unused bytes; clear zeroes 20 bytes; plaza move touches only the plaza", async () => {
  const { sav, map, free, env } = await real();
  const o = slotOff(sav, 5);
  sav.main.data.set([0xaa, 0xbb, 0xcc, 0xdd], o + 16); // distinct unused bytes
  const snap = sav.main.data.slice();
  const b = map.buildings[5]!;
  applyOp(sav, op([{ slot: 5, building: { ...b, subType: 3, typeArg: 4 } }]), env);
  expect([...sav.main.data.slice(o + 14, o + 20)]).toEqual([...snap.slice(o + 14, o + 20)]);
  const snap2 = sav.main.data.slice();
  applyOp(sav, op([{ slot: 5, building: bld(0, 0, 0) }]), env);
  expect([...sav.main.data.slice(o, o + 20)]).toEqual(new Array(20).fill(0));
  expect(diffOffsets(snap2, sav.main.data).every((i) => i >= o && i < o + 20)).toBe(true);

  const m2 = readMap(sav.main.data, sav.revision);
  const pz = { x: m2.plaza.x, z: m2.plaza.z };
  const ctx = { map: m2, acreTiles: acreTiles() };
  let to: { x: number; z: number } | null = null;
  for (let x = 20; x < 260 && !to; x += 2) for (let z = 40; z < 200 && !to; z += 2)
    if (x !== pz.x || z !== pz.z) try { planBuildingEdit(ctx, op([], { x, z })); to = { x, z }; } catch { /* blocked */ }
  void free;
  if (!to) throw new Error("no plaza spot");
  const before = sav.main.data.slice();
  applyOp(sav, op([], to), env);
  const po = plazaOff(sav);
  const ch = diffOffsets(before, sav.main.data);
  expect(ch.length).toBeGreaterThan(0);
  expect(ch.every((i) => (i >= po && i < po + 4) || (i >= po + 4 && i < po + 8))).toBe(true);
  const dv = new DataView(sav.main.data.buffer, sav.main.data.byteOffset);
  expect([dv.getUint32(po, true), dv.getUint32(po + 4, true)]).toEqual([to.x, to.z]);
});

goldenTest("buildingEdit undo/redo restore exact bytes; a batch of two is one step; a refusal records nothing", async () => {
  const { sav, map, free, env } = await real();
  const b5 = map.buildings[5]!;
  const to = free(5, (x, y) => ({ ...b5, x, y }));
  const session = new EditSession(sav);
  const before = hash(sav.main.data);
  const e = op([{ slot: 5, building: { ...b5, ...to } }]);
  session.apply("t", (s) => applyOp(s, e, env));
  const after = hash(sav.main.data);
  expect(after).not.toBe(before);
  session.undo();
  expect(hash(sav.main.data)).toBe(before);
  session.redo();
  expect(hash(sav.main.data)).toBe(after);

  const s2 = new EditSession(sav);
  const batch: EditOp = { op: "batch", label: "two", ops: [op([{ slot: 5, building: { ...b5, subType: 9 } }]), op([{ slot: 5, building: { ...b5, subType: 9, typeArg: 2 } }])] };
  s2.apply("two", (s) => applyOp(s, batch, env));
  expect(s2.changes.length).toBe(1);

  const s3 = new EditSession(sav);
  const h = hash(sav.main.data);
  expect(() => s3.apply("bad", (s) => applyOp(s, op([{ slot: 46, building: b5 }]), env))).toThrow("slot must be 0-45");
  expect(hash(sav.main.data)).toBe(h);
  expect(s3.changes.length).toBe(0);
  expect(() => validateOp(sav, op([{ slot: 5, building: b5 }]))).toThrow("Map data is not available");
});
