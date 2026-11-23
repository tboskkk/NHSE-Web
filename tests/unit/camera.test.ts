import { expect, test } from "bun:test";
import { clampCamera, MAX_ZOOM, MIN_ZOOM, panBy, zoomAt, type Camera } from "../../app/src/map/camera";

const bounds = { w: 4608, h: 4096 };
const view = { w: 1000, h: 800 };
const world = (c: Camera, sx: number, sy: number) => ({ x: c.x + sx / c.zoom, y: c.y + sy / c.zoom });

test("zoomAt keeps the world point under the cursor fixed", () => {
  const c: Camera = { x: 1000, y: 900, zoom: 0.5 };
  const before = world(c, 300, 200);
  const z = zoomAt(c, 2, 300, 200, bounds, view);
  expect(z.zoom).toBeCloseTo(1, 12);
  const after = world(z, 300, 200);
  expect(after.x).toBeCloseTo(before.x, 9);
  expect(after.y).toBeCloseTo(before.y, 9);
});

test("zoom is clamped to [MIN_ZOOM, MAX_ZOOM]", () => {
  const c: Camera = { x: 0, y: 0, zoom: 1 };
  expect(zoomAt(c, 1e9, 10, 10, bounds, view).zoom).toBe(MAX_ZOOM);
  expect(zoomAt(c, 1e-9, 10, 10, bounds, view).zoom).toBe(MIN_ZOOM);
});

test("panBy cannot push the island fully off-screen", () => {
  const c: Camera = { x: 0, y: 0, zoom: 1 };
  const far = panBy(c, -1e7, -1e7, bounds, view); // drag far right/down => camera goes negative
  expect(far.x).toBeGreaterThanOrEqual(0);
  expect(far.y).toBeGreaterThanOrEqual(0);
  const other = panBy(c, 1e7, 1e7, bounds, view);
  expect(other.x).toBeLessThanOrEqual(bounds.w - view.w);
  expect(other.y).toBeLessThanOrEqual(bounds.h - view.h);
});

test("when the island is smaller than the view it is centred", () => {
  const c = clampCamera({ x: 500, y: 500, zoom: MIN_ZOOM }, bounds, view);
  expect(c.x).toBeCloseTo((bounds.w - view.w / MIN_ZOOM) / 2, 9);
});

test("a zero-size view or non-finite input leaves the camera unchanged and finite", () => {
  const c: Camera = { x: 10, y: 20, zoom: 1 };
  expect(zoomAt(c, 2, 0, 0, bounds, { w: 0, h: 0 })).toEqual(c);
  expect(panBy(c, NaN, 5, bounds, view)).toEqual(c);
  const z = zoomAt(c, NaN, 5, 5, bounds, view);
  expect(Number.isFinite(z.x) && Number.isFinite(z.y) && Number.isFinite(z.zoom)).toBe(true);
});

import { fitRect } from "../../app/src/map/camera";

test("fitRect zooms to the tighter axis and centres the rectangle", () => {
  const c = fitRect({ x: 100, y: 50, w: 400, h: 200 }, { w: 800, h: 800 });
  expect(c.zoom).toBe(2); // width limits: 800 / 400
  expect(c.x).toBe(100); // rect.x - (view.w / zoom - rect.w) / 2 = 100 - 0
  expect(c.y).toBe(-50); // centred vertically: rect centre y 150 minus half the visible height (800 / 2 / 2 = 200)
  const tall = fitRect({ x: 0, y: 0, w: 100, h: 400 }, { w: 800, h: 400 });
  expect(tall.zoom).toBe(1);
  expect(tall.x).toBe(-350); // rect centre x 50 minus half the visible width 400
});

test("fitRect clamps the zoom and ignores degenerate input", () => {
  expect(fitRect({ x: 0, y: 0, w: 1, h: 1 }, { w: 1000, h: 1000 }).zoom).toBe(8); // MAX_ZOOM
  expect(fitRect({ x: 0, y: 0, w: 100000, h: 100000 }, { w: 100, h: 100 }).zoom).toBe(0.05); // MIN_ZOOM
  expect(fitRect({ x: 0, y: 0, w: 0, h: 10 }, { w: 100, h: 100 })).toEqual({ x: 0, y: 0, zoom: 1 });
  expect(fitRect({ x: 0, y: 0, w: 10, h: 10 }, { w: 0, h: 100 })).toEqual({ x: 0, y: 0, zoom: 1 });
});
