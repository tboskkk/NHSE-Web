import type { Ghost } from "../map/scene";
import { heightAt, type TileField } from "./terrainMesh";

export type Tile = { x: number; y: number };

const ACRE = 32;
const ITEM_ROWS = 6 * ACRE;
const TERRAIN = { w: 112, h: 96 };
const TERRAIN_ORIGIN = 32; // world units
const GHOST_LIFT = 0.15;

const itemOriginX = (itemAcreWidth: number) => ((9 - itemAcreWidth) / 2) * ACRE;

/** Item tile under a world point (x, z in item-tile units), or null outside the item layer. */
export function worldToItemTile(x: number, z: number, itemAcreWidth: number): Tile | null {
  const tx = Math.floor(x - itemOriginX(itemAcreWidth));
  const ty = Math.floor(z - ACRE);
  return tx >= 0 && ty >= 0 && tx < itemAcreWidth * ACRE && ty < ITEM_ROWS ? { x: tx, y: ty } : null;
}

/** World position of an item tile's top-left corner. */
export function itemTileOrigin(t: Tile, itemAcreWidth: number): { x: number; z: number } {
  return { x: itemOriginX(itemAcreWidth) + t.x, z: ACRE + t.y };
}

/** Terrain tile (112 x 96 grid, 2 units per tile) under a world point, or null outside it. */
export function worldToTerrainTile(x: number, z: number): Tile | null {
  const tx = Math.floor((x - TERRAIN_ORIGIN) / 2);
  const ty = Math.floor((z - TERRAIN_ORIGIN) / 2);
  return tx >= 0 && ty >= 0 && tx < TERRAIN.w && ty < TERRAIN.h ? { x: tx, y: ty } : null;
}

/** Highest ground under the world rectangle (x..x+w, z..z+h); `heightAt` clamps at the grid border. */
export function footprintHeight(f: TileField, x: number, z: number, w: number, h: number): number {
  let top = -Infinity;
  for (let i = 0; i < Math.max(1, Math.ceil(w)); i++)
    for (let j = 0; j < Math.max(1, Math.ceil(h)); j++) top = Math.max(top, heightAt(f, x + i + 0.5, z + j + 0.5));
  return top;
}

/** The ghost rectangle as four corners (x, y, z): top-left, top-right, bottom-right, bottom-left, draped just above the highest ground under it. */
export function ghostCorners(g: Ghost, itemAcreWidth: number, f: TileField): Float32Array {
  const o = itemTileOrigin({ x: g.x, y: g.y }, itemAcreWidth);
  const y = footprintHeight(f, o.x, o.z, g.w, g.h) + GHOST_LIFT;
  return Float32Array.of(o.x, y, o.z, o.x + g.w, y, o.z, o.x + g.w, y, o.z + g.h, o.x, y, o.z + g.h);
}
