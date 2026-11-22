import { expect, test } from "bun:test";
import { readMap, type MapData } from "../../packages/core/src/map/mapData";
import { REVISIONS } from "../../packages/core/src/save/revisions";
import { makeLayout } from "../../app/src/map/layout";
import { inspectTile } from "../../app/src/map/inspect";

const NONE = 0xfffen;
const layout = makeLayout(9);
const blank = (): MapData => {
  const m = readMap(new Uint8Array(REVISIONS[34]!.sizes.main), REVISIONS[34]!);
  m.items[0].raw.fill(NONE);
  m.items[1].raw.fill(NONE);
  m.buildings.forEach((b) => (b.type = 0));
  return m;
};

test("nothing hovered, or only empty tiles, is reported as empty", () => {
  const m = blank();
  expect(inspectTile(m, layout, null, null).empty).toBe(true);
  const r = inspectTile(m, layout, { x: 3, y: 4 }, { x: 10, y: 10 });
  expect(r.items).toEqual([]);
  expect(r.building).toBeNull();
  expect(r.terrain).toMatchObject({ x: 3, y: 4, unitModel: 0, elevation: 0 });
  expect(r.empty).toBe(false); // terrain is always something
});

test("reports terrain fields and non-empty items on both layers", () => {
  const m = blank();
  m.terrain.elevation[96 * 3 + 4] = 2;
  m.terrain.roadModel[96 * 3 + 4] = 0x47;
  m.items[0].raw[192 * 10 + 11] = 0x0000000100000123n;
  m.items[1].raw[192 * 10 + 11] = 0x0000000000000456n;
  const r = inspectTile(m, layout, { x: 3, y: 4 }, { x: 10, y: 11 });
  expect(r.terrain).toMatchObject({ elevation: 2, roadModel: 0x47 });
  expect(r.items).toEqual([
    { layer: 0, x: 10, y: 11, raw: "0000000100000123", id: 0x123, count: 1 },
    { layer: 1, x: 10, y: 11, raw: "0000000000000456", id: 0x456, count: 0 },
  ]);
});

test("extension tiles (0xfffd) are not reported as items", () => {
  const m = blank();
  m.items[0].raw[192 * 1 + 1] = 0xfffdn;
  expect(inspectTile(m, layout, null, { x: 1, y: 1 }).items).toEqual([]);
});

test("a building is hit within its 4x4 item-tile footprint and not just outside it", () => {
  const m = blank();
  m.buildings[5] = { ...m.buildings[5]!, type: 22, x: 192, y: 209 };
  // item tile (ix,iy) maps to world item tile (ix + 0, iy + 32) on a 9-acre-wide island
  expect(inspectTile(m, layout, null, { x: 195, y: 209 + 3 - 32 })?.building).toEqual({ index: 5, type: 22 });
  expect(inspectTile(m, layout, null, { x: 196, y: 209 - 32 }).building).toBeNull();
  expect(inspectTile(m, layout, null, { x: 192, y: 208 - 32 }).building).toBeNull();
});
