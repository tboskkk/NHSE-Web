import { expect, test } from "bun:test";
import { atlas, bakeCell, pickRow, type Ramp } from "../../scripts/models/bake";

// 3 wide x 3 tall ramp: row 0 grey, row 1 green, row 2 red (same colour across the row)
const row = (r: number, g: number, b: number) => [r, g, b, 255, r, g, b, 255, r, g, b, 255];
const ramp: Ramp = { width: 3, height: 3, data: Uint8Array.from([...row(120, 120, 120), ...row(20, 200, 30), ...row(220, 20, 20)]) };

test("pickRow: colour uses the index (clamped), trunk is row 0, foliage is the greenest row", () => {
  expect(pickRow(ramp, "colour", 2)).toBe(2);
  expect(pickRow(ramp, "colour", 9)).toBe(2);
  expect(pickRow(ramp, "colour", null)).toBe(0);
  expect(pickRow(ramp, "trunk", 2)).toBe(0);
  expect(pickRow(ramp, "foliage", null)).toBe(1);
});

test("bakeCell looks the ramp up by albedo grey at the chosen row", () => {
  const w = { width: 2, height: 2, data: Uint8Array.of(0, 255, 0, 255) };
  const gradient: Ramp = { width: 2, height: 1, data: Uint8Array.of(10, 20, 30, 255, 200, 210, 220, 255) };
  const px = bakeCell(w, null, gradient, 0, 2);
  expect([...px.subarray(0, 4)]).toEqual([10, 20, 30, 255]); // grey 0 -> ramp x 0
  expect([...px.subarray(4, 8)]).toEqual([200, 210, 220, 255]); // grey 255 -> ramp x last
});

test("bakeCell takes alpha from the opacity map (below 100 is transparent) and handles missing maps", () => {
  const alb = { width: 1, height: 1, data: Uint8Array.of(128) };
  const op = (v: number) => ({ width: 1, height: 1, data: Uint8Array.of(v) });
  expect(bakeCell(alb, op(99), null, 0, 1)[3]).toBe(0);
  expect(bakeCell(alb, op(100), null, 0, 1)[3]).toBe(255);
  expect([...bakeCell(alb, null, null, 0, 1)]).toEqual([128, 128, 128, 255]); // no ramp: grey
  expect([...bakeCell(null, null, null, 0, 1)]).toEqual([128, 128, 128, 255]); // no albedo: mid grey
});

test("bakeCell resamples a texture of another size to the cell size", () => {
  const alb = { width: 1, height: 1, data: Uint8Array.of(77) };
  const px = bakeCell(alb, null, null, 0, 4);
  expect(px.length).toBe(4 * 4 * 4);
  expect(px[0]).toBe(77);
  expect(px[63]).toBe(255);
});

test("atlas places cells side by side in order", () => {
  const a = Uint8Array.from({ length: 4 * 4 * 4 }, () => 10);
  const b = Uint8Array.from({ length: 4 * 4 * 4 }, () => 200);
  const at = atlas([a, b], 4);
  expect([at.width, at.height, at.data.length]).toEqual([8, 4, 8 * 4 * 4]);
  expect([at.data[0], at.data[4 * 4], at.data[(1 * 8 + 3) * 4], at.data[(1 * 8 + 4) * 4]]).toEqual([10, 200, 10, 200]);
});
