import { expect, test } from "bun:test";
import { GRASS, bakeTerrainMaterial, type TexLookup } from "../../scripts/models/terrainBake";
import type { DecodedTexture } from "../../scripts/sprites/bntx";

const rgba = (w: number, h: number, f: (x: number, y: number) => number[]): DecodedTexture => {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(f(x, y), (y * w + x) * 4);
  return { width: w, height: h, channels: 4, data };
};
const grey = (w: number, h: number, v: number | ((x: number, y: number) => number)): DecodedTexture => {
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = typeof v === "number" ? v : v(x, y);
  return { width: w, height: h, channels: 1, data };
};
const lookup = (m: Record<string, DecodedTexture>): TexLookup => (n) => m[n] ?? null;
const px = (cell: Uint8Array, x: number, y: number, size: number) => [...cell.subarray((y * size + x) * 4, (y * size + x) * 4 + 4)];

// 10 columns x 40 rows: pixel = (x, y, 7)
const grd = rgba(10, 40, (x, y) => [x, y, 7, 255]);
const expectedGrass = [Math.round(GRASS.column * 9), Math.min(GRASS.row, 39), 7, 255]; // the 40-row test ramp clamps the row

test("grass materials take the summer colour from mGrass_Grd and alpha from the opacity map", () => {
  const r = bakeTerrainMaterial("mGrass", lookup({ mGrass_Grd: grd }), 4);
  expect(r.known).toBe(true);
  expect(px(r.cell, 0, 0, 4)).toEqual(expectedGrass);
  const op = grey(2, 1, (x) => (x === 0 ? 99 : 100));
  const x = bakeTerrainMaterial("mGrassRiverXlu", lookup({ mGrass_Grd: grd, mGrassRiverXlu_OP: op }), 4);
  expect(px(x.cell, 0, 0, 4)[3]).toBe(0); // left half of the opacity map is below the cutoff
  expect(px(x.cell, 3, 0, 4)).toEqual(expectedGrass);
  expect(bakeTerrainMaterial("mProcGrass", lookup({ mGrass_Grd: grd }), 2).known).toBe(true);
});

test("cliff and river materials use their colour albedos, resampled", () => {
  const cliff = rgba(2, 1, (x) => (x === 0 ? [10, 20, 30, 255] : [200, 210, 220, 255]));
  const river = rgba(1, 1, () => [1, 2, 3, 255]);
  const t = lookup({ mCliff_Alb: cliff, mRiver_Alb: river });
  expect(px(bakeTerrainMaterial("mCliff", t, 4).cell, 0, 0, 4)).toEqual([10, 20, 30, 255]);
  expect(px(bakeTerrainMaterial("mCliff", t, 4).cell, 3, 0, 4)).toEqual([200, 210, 220, 255]);
  expect(px(bakeTerrainMaterial("mRiver2Cliff", t, 4).cell, 0, 0, 4)).toEqual([10, 20, 30, 255]);
  expect(px(bakeTerrainMaterial("mRiver", t, 2).cell, 1, 1, 2)).toEqual([1, 2, 3, 255]);
});

test("waterfall is a fixed light blue", () => {
  const r = bakeTerrainMaterial("mWaterfall", lookup({}), 2);
  expect(r.known).toBe(true);
  expect(px(r.cell, 0, 0, 2)).toEqual([150, 210, 235, 255]);
});

test("road materials use their albedo, else the mean colour of their ramp", () => {
  const alb = rgba(1, 1, () => [90, 40, 30, 255]);
  expect(px(bakeTerrainMaterial("mRoadBrick", lookup({ mRoadBrick_Alb: alb }), 2).cell, 0, 0, 2)).toEqual([90, 40, 30, 255]);
  const ramp = rgba(2, 1, (x) => (x === 0 ? [0, 100, 200, 255] : [100, 200, 100, 255]));
  const r = bakeTerrainMaterial("mRoadSoil", lookup({ mRoadSoil_Grd: ramp }), 2);
  expect(r.known).toBe(true);
  expect(px(r.cell, 0, 0, 2)).toEqual([50, 150, 150, 255]);
});

test("unknown materials and missing source textures bake magenta and are flagged", () => {
  const unknown = bakeTerrainMaterial("mMystery", lookup({}), 2);
  expect(unknown.known).toBe(false);
  expect(px(unknown.cell, 0, 0, 2)).toEqual([255, 0, 255, 255]);
  const noRamp = bakeTerrainMaterial("mGrass", lookup({}), 2);
  expect(noRamp.known).toBe(false);
  expect(bakeTerrainMaterial("mCliff", lookup({}), 2).known).toBe(false);
  expect(bakeTerrainMaterial("mRoadWood", lookup({}), 2).known).toBe(false);
});
