import type { GridSpec } from "./tiles";

/** World px per item tile (items are the finest grid; a terrain tile is 2x2 item tiles). */
export const PX_PER_ITEM_TILE = 16;
const ACRE_ITEM_TILES = 32;
/** The whole map: 9x8 acres of 32 item tiles (deep sea and shore included). */
export const WORLD_PX = { w: 9 * ACRE_ITEM_TILES * PX_PER_ITEM_TILE, h: 8 * ACRE_ITEM_TILES * PX_PER_ITEM_TILE } as const;

export type Layout = {
  terrain: GridSpec;
  items: GridSpec;
  /** Buildings and the plaza are stored in world item-tile units. */
  toWorldPx(x: number, y: number): { x: number; y: number };
};

/** Placement of each layer in world px (see the Task 2 ledger ruling). `itemAcreWidth` is 7 before 3.0.0, 9 from 3.0.0. */
export function makeLayout(itemAcreWidth: number): Layout {
  const acrePx = ACRE_ITEM_TILES * PX_PER_ITEM_TILE;
  return {
    terrain: { tileSize: 2 * PX_PER_ITEM_TILE, width: 7 * 16, height: 6 * 16, originX: acrePx, originY: acrePx },
    items: {
      tileSize: PX_PER_ITEM_TILE,
      width: itemAcreWidth * ACRE_ITEM_TILES,
      height: 6 * ACRE_ITEM_TILES,
      originX: ((9 - itemAcreWidth) / 2) * acrePx,
      originY: acrePx,
    },
    toWorldPx: (x, y) => ({ x: x * PX_PER_ITEM_TILE, y: y * PX_PER_ITEM_TILE }),
  };
}

/** Buildings are drawn (and hit-tested) as squares this many item tiles wide (upstream imgScale * 2). */
export const BUILDING_TILES = 4;

/** The area "fit" frames: the terrain grid (7 x 6 acres, one acre in) plus a quarter acre of shore and sea around it. */
export const ISLAND_FIT_PX = {
  x: (1 - 0.25) * ACRE_ITEM_TILES * PX_PER_ITEM_TILE,
  y: (1 - 0.25) * ACRE_ITEM_TILES * PX_PER_ITEM_TILE,
  w: (7 + 0.5) * ACRE_ITEM_TILES * PX_PER_ITEM_TILE,
  h: (6 + 0.5) * ACRE_ITEM_TILES * PX_PER_ITEM_TILE,
} as const;
