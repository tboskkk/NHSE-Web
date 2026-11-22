import { expect, test } from "bun:test";
import { readMap, tileIndex } from "../../packages/core/src/map/mapData";
import { REVISIONS } from "../../packages/core/src/save/revisions";

test("tileIndex is column-major: totalHeight*x + y", () => {
  expect(tileIndex(96, 2, 5)).toBe(197);
  expect(tileIndex(96, 0, 0)).toBe(0);
});

test("pre-3.0.0 revisions read a 7-acre-wide item grid (224x192)", () => {
  const rev = REVISIONS[0]!;
  const m = readMap(new Uint8Array(rev.sizes.main), rev);
  expect(m.items[0].width).toBe(224);
  expect(m.items[0].height).toBe(192);
  expect(m.items[0].raw.length).toBe(224 * 192);
  expect(m.items[1].flags.length).toBe(224 * 192);
});

test("3.0.x revisions read a 9-acre-wide item grid (288x192) and 46 building slots", () => {
  const rev = REVISIONS[34]!;
  const m = readMap(new Uint8Array(rev.sizes.main), rev);
  expect(m.items[0].width).toBe(288);
  expect(m.terrain.width).toBe(112);
  expect(m.terrain.height).toBe(96);
  expect(m.buildings.length).toBe(46); // empty slots (type 0) are kept
  expect(m.acres.length).toBe(72);
});

test("a buffer shorter than the layout throws RangeError", () => {
  expect(() => readMap(new Uint8Array(1000), REVISIONS[34]!)).toThrow(RangeError);
});
