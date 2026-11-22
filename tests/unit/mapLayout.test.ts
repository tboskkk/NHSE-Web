import { expect, test } from "bun:test";
import { makeLayout, WORLD_PX } from "../../app/src/map/layout";

test("world is 9x8 acres at 16 px per item tile", () => {
  expect(WORLD_PX).toEqual({ w: 4608, h: 4096 });
});

test("terrain grid sits one acre in; item grid is centred horizontally by its acre width", () => {
  const l9 = makeLayout(9);
  expect(l9.terrain).toEqual({ tileSize: 32, width: 112, height: 96, originX: 512, originY: 512 });
  expect(l9.items).toEqual({ tileSize: 16, width: 288, height: 192, originX: 0, originY: 512 });
  const l7 = makeLayout(7);
  expect(l7.items).toEqual({ tileSize: 16, width: 224, height: 192, originX: 512, originY: 512 });
});

test("building and plaza coordinates are world item-tile units (x16 px)", () => {
  const l = makeLayout(9);
  expect(l.toWorldPx(192, 209)).toEqual({ x: 3072, y: 3344 });
});
