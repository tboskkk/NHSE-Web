import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import observed from "../../packages/core/src/generated/terrain-observed.json";
import { applyOp } from "../../packages/core/src/edit/ops";
import { EditSession } from "../../packages/core/src/edit/session";
import { classifyUnit } from "../../packages/core/src/map/ground";
import { planTerrainEdit, terrainTileAt, type TerrainEditOp, type TerrainTileValue, writeTerrain } from "../../packages/core/src/map/applyTerrainEdit";
import { readTerrain } from "../../packages/core/src/map/terrainTile";
import { readMap } from "../../packages/core/src/map/mapData";
import { HorizonSave } from "../../packages/core/src/save/horizonSave";
import type { Revision } from "../../packages/core/src/save/revisions";
import { goldenTest, readDir, REPO, SAVE } from "../golden/helpers";
import { ctxOf } from "./mapFixture";

const FLAT: TerrainTileValue = { unitModel: 0, variation: 0, angle: 0, roadModel: 0, roadVariation: 0, roadAngle: 0, elevation: 0 };
const [gm, gv, ga] = Object.keys(observed.ground).find((k) => k !== "0,0,0")!.split(",").map(Number) as [number, number, number];
const NONBASE: TerrainTileValue = { ...FLAT, unitModel: gm, variation: gv, angle: ga };
const classOf = (m: number) => classifyUnit(m) as "base" | "river" | "cliff" | "fall";
const op = (changes: TerrainEditOp["changes"]): TerrainEditOp => ({ op: "terrainEdit", label: "t", changes });
const at = (x: number, y: number, tile: TerrainTileValue) => ({ x, y, tile });
// terrain tiles x,y in 0..15 sit in world acre index 10; make that acre static (template class 0 = grass)
const withStaticAcre = () => {
  const ctx = ctxOf();
  ctx.map.acres[10] = 5;
  return ctx;
};

test("a valid stamp returns one write at index 96*x+y", () => {
  const w = planTerrainEdit(ctxOf(), op([at(20, 30, NONBASE)]));
  expect(w).toEqual([{ index: 96 * 20 + 30, tile: NONBASE }]);
});

test("identical tile produces no writes", () => {
  expect(planTerrainEdit(ctxOf(), op([at(20, 30, FLAT)]))).toEqual([]);
});

test("duplicate coordinates: last wins", () => {
  const w = planTerrainEdit(ctxOf(), op([at(20, 30, NONBASE), at(20, 30, FLAT)]));
  expect(w).toEqual([]);
});

test("unobserved ground triple is refused and nothing changes", () => {
  const ctx = ctxOf();
  expect(() => planTerrainEdit(ctx, op([at(20, 30, NONBASE), at(21, 30, { ...FLAT, unitModel: 999, variation: 9, angle: 9 })]))).toThrow(/ground combination not seen/);
  expect(ctx.map.terrain.unitModel[96 * 20 + 30]).toBe(0);
});

test("unobserved road triple is refused", () => {
  expect(() => planTerrainEdit(ctxOf(), op([at(20, 30, { ...FLAT, roadModel: 77, roadVariation: 1, roadAngle: 1 })]))).toThrow(/road combination not seen/);
});

test("elevation-only change on a tile with an unobserved triple is allowed", () => {
  const ctx = ctxOf();
  const i = 96 * 20 + 30;
  ctx.map.terrain.unitModel[i] = gm;
  ctx.map.terrain.variation[i] = 999; // a combination only another save would have
  const [, hi] = observed.elevation[classOf(gm)] as [number, number];
  const same = { ...FLAT, unitModel: gm, variation: 999, angle: 0 };
  expect(planTerrainEdit(ctx, op([at(20, 30, { ...same, elevation: hi })]))).toEqual([{ index: i, tile: { ...same, elevation: hi } }]);
});

test("elevation within the base range is allowed on a base tile", () => {
  const [lo, hi] = observed.elevation.base as [number, number];
  const w = planTerrainEdit(ctxOf(), op([at(20, 30, { ...FLAT, elevation: hi })]));
  expect(w).toHaveLength(hi === lo ? 0 : 1);
});

test("elevation outside the observed range is refused", () => {
  const [, hi] = observed.elevation.base as [number, number];
  expect(() => planTerrainEdit(ctxOf(), op([at(20, 30, { ...FLAT, elevation: hi + 1 })]))).toThrow(/elevation out of the observed range/);
});

test("static-acre tile is refused", () => {
  expect(() => planTerrainEdit(withStaticAcre(), op([at(3, 3, NONBASE)]))).toThrow(/fixed acre/);
});

test("a stroke touching one static tile is refused whole", () => {
  const ctx = withStaticAcre();
  expect(() => planTerrainEdit(ctx, op([at(20, 30, NONBASE), at(3, 3, NONBASE)]))).toThrow(/fixed acre/);
  expect(ctx.map.terrain.unitModel[96 * 20 + 30]).toBe(0);
});

test("out-of-range coordinates and non-integer fields throw RangeError", () => {
  for (const c of [at(-1, 0, FLAT), at(0, 96, FLAT), at(112, 0, FLAT), at(1.5, 0, FLAT), at(0, 0, { ...FLAT, variation: -1 }), at(0, 0, { ...FLAT, angle: 65536 }), at(0, 0, { ...FLAT, elevation: 0.5 })])
    expect(() => planTerrainEdit(ctxOf(), op([c]))).toThrow(RangeError);
});

test("writeTerrain patches only changed records in the 14-byte LE layout", () => {
  const buf = new Uint8Array(112 * 96 * 14 + 100);
  const rev = { mainOffsets: { landMakingMap: 100 } } as unknown as Revision;
  const tile = { unitModel: 11, variation: 2, angle: 3, roadModel: 5, roadVariation: 6, roadAngle: 7, elevation: 8 };
  writeTerrain(buf, rev, [{ index: 96 * 2 + 3, tile }]);
  const t = readTerrain(buf, 100, 112, 96);
  expect(terrainTileAt({ terrain: t } as never, 96 * 2 + 3)).toEqual(tile);
  expect(buf.slice(0, 100).every((b) => b === 0)).toBe(true);
  expect(buf.slice(100 + 14 * (96 * 2 + 4)).every((b) => b === 0)).toBe(true);
});

goldenTest("terrainEdit through applyOp is one undo step and undo restores the bytes", async () => {
  const sav = await HorizonSave.load(readDir(SAVE!));
  const acreTiles = new Uint8Array(readFileSync(join(REPO, "app/public/data/acretiles.bin")));
  const map = readMap(sav.main.data, sav.revision);
  const ctx = { map, acreTiles };
  let found: { x: number; y: number } | null = null;
  for (let x = 0; x < 112 && !found; x++)
    for (let y = 0; y < 96 && !found; y++) {
      try { if (planTerrainEdit(ctx, op([at(x, y, NONBASE)])).length) found = { x, y }; } catch { /* next */ }
    }
  expect(found).not.toBeNull();
  const before = sav.main.data.slice();
  const session = new EditSession(sav);
  const change = session.apply("Stamp terrain", (s) => applyOp(s, op([at(found!.x, found!.y, NONBASE)]), { acreTiles }));
  expect(change).not.toBeNull();
  expect(readMap(sav.main.data, sav.revision).terrain.unitModel[96 * found!.x + found!.y]).toBe(NONBASE.unitModel);
  expect(session.changes).toHaveLength(1);
  session.undo();
  expect(Buffer.from(sav.main.data).equals(Buffer.from(before))).toBe(true);
  // an op equal to the current tiles records no history entry
  expect(session.apply("noop", (s) => applyOp(s, op([at(found!.x, found!.y, terrainTileAt(map, 96 * found!.x + found!.y))]), { acreTiles }))).toBeNull();
});
