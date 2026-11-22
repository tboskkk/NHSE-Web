/** World = 9x8 acres of 32 item tiles; terrain (7x6 acres) starts one acre in; item layer is centered horizontally. */
export const ACRE_ITEM_TILES = 32;
export const WORLD_ITEM_TILES = { w: 9 * ACRE_ITEM_TILES, h: 8 * ACRE_ITEM_TILES } as const;
export const TERRAIN_ORIGIN_TILES = 16; // terrain-resolution tiles (one acre)
export const BUILDING_ITEM_TILES = 4;
export const PLAZA_ITEM_TILES = { w: 24, h: 20 } as const;

/** World item-tile position of an item-layer tile. `itemAcreWidth` is 7 before 3.0.0, 9 from 3.0.0. */
export function itemToWorld(itemAcreWidth: number, x: number, y: number): { x: number; y: number } {
  return { x: ((9 - itemAcreWidth) / 2) * ACRE_ITEM_TILES + x, y: ACRE_ITEM_TILES + y };
}
