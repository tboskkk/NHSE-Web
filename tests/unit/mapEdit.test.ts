import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applyOp, describeOp, validateOp, type EditOp } from "../../packages/core/src/edit/ops";
import { EditSession } from "../../packages/core/src/edit/session";
import { makeExtension, NONE_RAW } from "../../packages/core/src/map/footprint";
import { planMapEdit } from "../../packages/core/src/map/applyMapEdit";
import { readMap } from "../../packages/core/src/map/mapData";
import { HorizonSave } from "../../packages/core/src/save/horizonSave";
import { goldenTest, hash, readDir, REPO, SAVE } from "../golden/helpers";
import { ctxOf, emptyMap, idOfSize, rawOf } from "./mapFixture";

const hex = (r: bigint) => r.toString(16).padStart(16, "0");
const ONE = rawOf(idOfSize("S_1_0x1_0"));
const BIG = rawOf(idOfSize("S_2_0x2_0")); // 4x4 tiles
const op = (changes: { x: number; y: number; raw: bigint }[], layer: 0 | 1 = 0): Extract<EditOp, { op: "mapEdit" }> =>
  ({ op: "mapEdit", layer, label: "test", changes: changes.map((c) => ({ x: c.x, y: c.y, raw: hex(c.raw) })) });
const asMap = (rs: { index: number; raw: bigint }[]) => new Map(rs.map((r) => [r.index, r.raw]));

test("placing a 1x1 item (2x2 tiles) writes root and three extensions", () => {
  const got = asMap(planMapEdit(ctxOf(), op([{ x: 100, y: 100, raw: ONE }])));
  expect(got.size).toBe(4);
  expect(got.get(192 * 100 + 100)).toBe(ONE);
  expect(got.get(192 * 101 + 101)).toBe(makeExtension(ONE, 1, 1));
  expect(got.get(192 * 100 + 101)).toBe(makeExtension(ONE, 0, 1));
});

test("placing a 4x4-tile item writes 15 extensions with offsets from the root", () => {
  const got = asMap(planMapEdit(ctxOf(), op([{ x: 50, y: 60, raw: BIG }])));
  expect(got.size).toBe(16);
  expect(got.get(192 * 53 + 63)).toBe(makeExtension(BIG, 3, 3));
});

test("erasing through an extension tile clears the whole footprint", () => {
  const m = emptyMap();
  for (const [i, r] of asMap(planMapEdit(ctxOf(m), op([{ x: 50, y: 60, raw: BIG }])))) m.items[0].raw[i] = r;
  const got = asMap(planMapEdit(ctxOf(m), op([{ x: 52, y: 62, raw: NONE_RAW }])));
  expect(got.size).toBe(16);
  expect([...got.values()].every((r) => r === NONE_RAW)).toBe(true);
});

test("placing over an existing larger item replaces it and clears every old tile", () => {
  const m = emptyMap();
  for (const [i, r] of asMap(planMapEdit(ctxOf(m), op([{ x: 50, y: 60, raw: BIG }])))) m.items[0].raw[i] = r;
  const got = asMap(planMapEdit(ctxOf(m), op([{ x: 51, y: 61, raw: ONE }])));
  expect(got.get(192 * 51 + 61)).toBe(ONE);
  expect(got.get(192 * 50 + 60)).toBe(NONE_RAW); // old root gone
  expect(got.get(192 * 53 + 63)).toBe(NONE_RAW); // old far extension gone
});

test("layers are independent", () => {
  const m = emptyMap();
  for (const [i, r] of asMap(planMapEdit(ctxOf(m), op([{ x: 50, y: 60, raw: BIG }], 0)))) m.items[0].raw[i] = r;
  expect(planMapEdit(ctxOf(m), op([{ x: 50, y: 60, raw: BIG }], 1)).length).toBe(16);
});

test("a refused placement throws with the reason", () => {
  expect(() => planMapEdit(ctxOf(), op([{ x: 287, y: 100, raw: BIG }]))).toThrow("outside the map");
});

test("extension raw values and out-of-range coordinates are rejected as input", () => {
  expect(() => planMapEdit(ctxOf(), op([{ x: 1, y: 1, raw: makeExtension(BIG, 1, 1) }]))).toThrow();
  expect(() => planMapEdit(ctxOf(), op([{ x: -1, y: 1, raw: ONE }]))).toThrow(RangeError);
  expect(() => planMapEdit(ctxOf(), { op: "mapEdit", layer: 2 as 0, label: "x", changes: [] })).toThrow(RangeError);
});

test("later changes see earlier ones in the same op (place then erase nets to nothing)", () => {
  expect(planMapEdit(ctxOf(), op([{ x: 100, y: 100, raw: BIG }, { x: 100, y: 100, raw: NONE_RAW }]))).toEqual([]);
  const got = asMap(planMapEdit(ctxOf(), op([{ x: 100, y: 100, raw: BIG }, { x: 100, y: 100, raw: ONE }])));
  expect(got.get(192 * 100 + 100)).toBe(ONE);
  expect(got.get(192 * 103 + 103)).toBeUndefined(); // the far corner of the first item was cleared again, net unchanged
});

test("more than a full layer of changes is refused", () => {
  const ch = Array.from({ length: 288 * 192 + 1 }, () => ({ x: 0, y: 0, raw: NONE_RAW }));
  expect(() => planMapEdit(ctxOf(), op(ch))).toThrow(RangeError);
});

// ---- against a real save ----
const acreTiles = () => new Uint8Array(readFileSync(join(REPO, "app/public/data/acretiles.bin")));
async function fresh() {
  const sav = await HorizonSave.load(readDir(SAVE!));
  const map = readMap(sav.main.data, sav.revision);
  const ctx = { map, acreTiles: acreTiles() };
  // first free 4x4 spot per the strict rules, found by trying the planner
  for (let x = 60; x < 200; x += 4)
    for (let y = 60; y < 150; y += 4)
      try { planMapEdit(ctx, op([{ x, y, raw: BIG }])); return { sav, ctx, x, y }; } catch { /* occupied */ }
  throw new Error("no free spot");
}

goldenTest("mapEdit writes item bytes, dirties only main, and undo/redo restore exact bytes", async () => {
  const { sav, x, y } = await fresh();
  const env = { acreTiles: acreTiles() };
  const session = new EditSession(sav);
  const before = hash(sav.main.data);
  const e = op([{ x, y, raw: BIG }]);
  expect(describeOp(sav, undefined as never, e)).toBe("test");
  const change = session.apply("test", (s) => applyOp(s, e, env));
  expect(change).not.toBeNull();
  expect([...session.dirtyPairs()]).toEqual(["main"]);
  const o = sav.revision.mainOffsets;
  const dv = new DataView(sav.main.data.buffer, sav.main.data.byteOffset);
  expect(dv.getBigUint64(o.fieldItem + 8 * (192 * x + y), true)).toBe(BIG);
  expect(dv.getBigUint64(o.fieldItem + 8 * (192 * (x + 3) + y + 3), true)).toBe(makeExtension(BIG, 3, 3));
  const after = hash(sav.main.data);
  expect(after).not.toBe(before);
  session.undo();
  expect(hash(sav.main.data)).toBe(before);
  session.redo();
  expect(hash(sav.main.data)).toBe(after);
  expect(session.changes.length).toBe(1);
});

goldenTest("a refused mapEdit changes no bytes and records nothing", async () => {
  const { sav } = await fresh();
  const env = { acreTiles: acreTiles() };
  const session = new EditSession(sav);
  const before = hash(sav.main.data);
  expect(() => session.apply("bad", (s) => applyOp(s, op([{ x: 287, y: 5, raw: BIG }]), env))).toThrow("outside the map");
  expect(hash(sav.main.data)).toBe(before);
  expect(session.changes.length).toBe(0);
  expect(() => validateOp(sav, op([{ x: 100, y: 100, raw: ONE }]))).toThrow("Map data is not available");
});
