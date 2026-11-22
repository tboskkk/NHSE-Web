import { expect, test } from "bun:test";
import { checkPlacement, footprintTiles, rootOf } from "../../packages/core/src/map/placement";
import { makeExtension } from "../../packages/core/src/map/footprint";
import { ctxOf, emptyMap, idOfSize, rawOf } from "./mapFixture";

const ONE = rawOf(idOfSize("S_1_0x1_0"));
const TWO = rawOf(idOfSize("S_2_0x2_0"));
const WIDE = (rot: number) => rawOf(idOfSize("S_2_0x1_0"), rot);
const put = (m: ReturnType<typeof emptyMap>, layer: 0 | 1, x: number, y: number, raw: bigint) => { m.items[layer].raw[192 * x + y] = raw; };

test("a free spot on grass is valid", () => {
  expect(checkPlacement(ctxOf(), 0, 100, 100, TWO)).toBeNull();
});

test("a footprint running off the grid is refused", () => {
  expect(checkPlacement(ctxOf(), 0, 287, 100, TWO)).toBe("outside the map");
});

test("odd rotation swaps the footprint and is refused at the bottom edge", () => {
  expect(checkPlacement(ctxOf(), 0, 100, 190, WIDE(0))).toBeNull(); // 4 wide x 2 tall fits rows 190-191
  expect(checkPlacement(ctxOf(), 0, 100, 190, WIDE(1))).toBe("outside the map"); // 2 wide x 4 tall
});

test("overlapping a root or an extension tile on the same layer is refused", () => {
  const m = emptyMap();
  put(m, 0, 100, 100, TWO);
  put(m, 0, 101, 101, makeExtension(TWO, 1, 1));
  expect(checkPlacement(ctxOf(m), 0, 101, 101, ONE)).toBe("overlaps another item");
  expect(checkPlacement(ctxOf(m), 0, 99, 99, TWO)).toBe("overlaps another item");
  expect(checkPlacement(ctxOf(m), 1, 100, 100, TWO)).toBeNull(); // other layer is free
});

test("ignore lets a planner treat tiles being cleared as empty", () => {
  const m = emptyMap();
  put(m, 0, 100, 100, ONE);
  expect(checkPlacement(ctxOf(m), 0, 100, 100, ONE, { ignore: new Set([192 * 100 + 100]) })).toBeNull();
});

test("river and cliff terrain refuse with their reason", () => {
  const m = emptyMap();
  // item tile (100,100) -> world tile (100>>1, 100>>1)+... originX 0, originY 32 -> terrain tile ((100>>1)-16, ((132)>>1)-16)
  const tx = (100 >> 1) - 16, ty = ((100 + 32) >> 1) - 16;
  m.terrain.unitModel[96 * tx + ty] = 0x05; // river
  expect(checkPlacement(ctxOf(m), 0, 100, 100, ONE)).toBe("water");
  m.terrain.unitModel[96 * tx + ty] = 0x20; // cliff
  expect(checkPlacement(ctxOf(m), 0, 100, 100, ONE)).toBe("cliff");
});

test("buildings and the plaza block placement", () => {
  const m = emptyMap();
  m.buildings.push({ type: 5, x: 100, y: 132, angle: 0, bit: 0, subType: 0, typeArg: 0, uniqueId: 0 });
  expect(checkPlacement(ctxOf(m), 0, 101, 100, ONE)).toBe("overlaps a building"); // world y = 132
  m.plaza = { x: 150, z: 132 };
  expect(checkPlacement(ctxOf(m), 0, 160, 100, ONE)).toBe("overlaps the plaza");
});

test("ids past the size table are refused", () => {
  expect(checkPlacement(ctxOf(), 0, 100, 100, rawOf(0xfff0))).toBe("unknown item size");
});

test("rootOf resolves extension tiles to their root and reports orphans", () => {
  const m = emptyMap();
  put(m, 0, 100, 100, TWO);
  put(m, 0, 101, 101, makeExtension(TWO, 1, 1));
  put(m, 0, 50, 50, makeExtension(TWO, 1, 1)); // orphan: no root at (49,49)
  expect(rootOf(m, 0, 101, 101)).toMatchObject({ x: 100, y: 100, raw: TWO, orphan: false });
  expect(rootOf(m, 0, 50, 50)).toMatchObject({ x: 50, y: 50, orphan: true });
  expect(rootOf(m, 0, 10, 10)).toBeNull();
});

test("footprintTiles lists the root first", () => {
  expect(footprintTiles(TWO, 10, 20)).toEqual([{ x: 10, y: 20 }, { x: 10, y: 21 }, { x: 10, y: 22 }, { x: 10, y: 23 }, { x: 11, y: 20 }, { x: 11, y: 21 }, { x: 11, y: 22 }, { x: 11, y: 23 }, { x: 12, y: 20 }, { x: 12, y: 21 }, { x: 12, y: 22 }, { x: 12, y: 23 }, { x: 13, y: 20 }, { x: 13, y: 21 }, { x: 13, y: 22 }, { x: 13, y: 23 }]);
});
