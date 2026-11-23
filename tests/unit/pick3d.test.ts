import { expect, test } from "bun:test";
import { LEVEL_HEIGHT } from "../../app/src/map3d/constants";
import { footprintHeight, ghostCorners, itemTileOrigin, worldToItemTile, worldToTerrainTile } from "../../app/src/map3d/pick";
import { buildTileField } from "../../app/src/map3d/terrainMesh";
import { emptyMap } from "./mapFixture";

const field = (elev?: [number, number, number]) => {
  const m = emptyMap();
  if (elev) m.terrain.elevation[96 * elev[0] + elev[1]] = elev[2];
  return buildTileField(m, new Uint8Array(318 * 256));
};

test("world points map to item tiles for a 9-acre layer", () => {
  expect(worldToItemTile(0.5, 32.5, 9)).toEqual({ x: 0, y: 0 });
  expect(worldToItemTile(287.9, 223.9, 9)).toEqual({ x: 287, y: 191 });
  expect(worldToItemTile(-0.1, 40, 9)).toBeNull();
  expect(worldToItemTile(10, 224, 9)).toBeNull();
  expect(worldToItemTile(10, 31.9, 9)).toBeNull();
});

test("a 7-acre layer starts one acre in (origin x = 32)", () => {
  expect(worldToItemTile(32.5, 32.5, 7)).toEqual({ x: 0, y: 0 });
  expect(worldToItemTile(255.9, 223.9, 7)).toEqual({ x: 223, y: 191 });
  expect(worldToItemTile(31.9, 40, 7)).toBeNull();
  expect(worldToItemTile(256, 40, 7)).toBeNull();
});

test("itemTileOrigin is the exact inverse of worldToItemTile", () => {
  for (const aw of [7, 9]) {
    const t = worldToItemTile(aw === 7 ? 50.3 : 18.3, 60.7, aw)!;
    const o = itemTileOrigin(t, aw);
    expect(worldToItemTile(o.x + 0.01, o.z + 0.01, aw)).toEqual(t);
    expect(worldToItemTile(o.x - 0.01, o.z + 0.5, aw)?.x).not.toBe(t.x);
  }
  expect(itemTileOrigin({ x: 0, y: 0 }, 7)).toEqual({ x: 32, z: 32 });
  expect(itemTileOrigin({ x: 3, y: 4 }, 9)).toEqual({ x: 3, z: 36 });
});

test("world points map to terrain tiles inside the 112 x 96 grid only", () => {
  expect(worldToTerrainTile(32.5, 32.5)).toEqual({ x: 0, y: 0 });
  expect(worldToTerrainTile(255.9, 223.9)).toEqual({ x: 111, y: 95 });
  expect(worldToTerrainTile(33.9, 33.9)).toEqual({ x: 0, y: 0 });
  expect(worldToTerrainTile(34, 34)).toEqual({ x: 1, y: 1 });
  expect(worldToTerrainTile(31.9, 40)).toBeNull();
  expect(worldToTerrainTile(256, 40)).toBeNull();
  expect(worldToTerrainTile(40, 224)).toBeNull();
});

test("footprintHeight is the highest ground under the rectangle", () => {
  const f = field([10, 10, 2]); // terrain tile (10,10) = world units 52..54
  expect(footprintHeight(f, 52, 52, 2, 2)).toBe(2 * LEVEL_HEIGHT);
  expect(footprintHeight(f, 50, 50, 4, 4)).toBe(2 * LEVEL_HEIGHT); // straddling the ledge
  expect(footprintHeight(f, 54, 52, 2, 2)).toBe(0);
});

test("footprintHeight clamps at the grid border instead of reading outside it", () => {
  const f = field();
  expect(Number.isFinite(footprintHeight(f, 286, 254, 4, 4))).toBe(true);
  expect(Number.isFinite(footprintHeight(f, -3, -3, 4, 4))).toBe(true);
});

test("a ghost on a raised tile is draped just above it, spanning exactly its footprint", () => {
  const f = field([10, 10, 2]);
  // item tile (52,20) in a 9-acre layer (origin x 0, z 32) is world (52,52)
  const c = ghostCorners({ x: 52, y: 20, w: 2, h: 2, ok: true }, 9, f);
  expect(c).toHaveLength(12);
  for (const i of [1, 4, 7, 10]) expect(c[i]).toBeCloseTo(2 * LEVEL_HEIGHT + 0.15, 5);
  expect([c[0], c[3], c[6], c[9]]).toEqual([52, 54, 54, 52]); // x: TL, TR, BR, BL
  expect([c[2], c[5], c[8], c[11]]).toEqual([52, 52, 54, 54]); // z
});

test("a ghost on a 7-acre layer is offset by the layer origin", () => {
  const f = field();
  const c = ghostCorners({ x: 0, y: 0, w: 1, h: 1, ok: false }, 7, f);
  expect([c[0], c[2]]).toEqual([32, 32]);
});
