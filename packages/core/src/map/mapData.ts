import type { Revision } from "../save/revisions";
import { type BuildingInfo, readBuildings } from "./building";
import { readTerrain, type TerrainLayer } from "./terrainTile";

export type { BuildingInfo } from "./building";
export type { TerrainLayer } from "./terrainTile";

export const TERRAIN_TILES_PER_ACRE = 16;
export const ITEM_TILES_PER_ACRE = 32;
export const TERRAIN_ACRES = { w: 7, h: 6 } as const;
/** Whole map including the deep-sea/shore border (AcreCoordinate exterior). */
export const WORLD_ACRES = { w: 9, h: 8 } as const;
export const ITEM_ACRES_HEIGHT = 6;

/** Field item layer: `raw` are u64 item values (column-major); `flags` are the raw stored flag-region bytes (opaque in P1). */
export type ItemLayer = { width: number; height: number; raw: BigUint64Array; flags: Uint8Array };

export type MapData = {
  terrain: TerrainLayer;
  items: [ItemLayer, ItemLayer];
  buildings: BuildingInfo[];
  /** 9x8 u16 acre base layout (OutsideField). */
  acres: Uint16Array;
  acreWidth: 9;
  acreHeight: 8;
  /** Plaza position in world item-tile units (EventPlazaLeftUpX/Z). */
  plaza: { x: number; z: number };
};

/** Column-major index used by terrain and item layers. */
export function tileIndex(totalHeight: number, x: number, y: number): number {
  return totalHeight * x + y;
}

export function readMap(main: Uint8Array, rev: Revision): MapData {
  const o = rev.mainOffsets;
  const dv = new DataView(main.buffer, main.byteOffset, main.byteLength);
  const check = (end: number, what: string) => {
    if (end > main.length) throw new RangeError(`${what} needs ${end} bytes, main.dat has ${main.length}`);
  };

  const terrain = readTerrain(main, o.landMakingMap, TERRAIN_ACRES.w * TERRAIN_TILES_PER_ACRE, TERRAIN_ACRES.h * TERRAIN_TILES_PER_ACRE);

  const width = o.fieldItemAcreWidth * ITEM_TILES_PER_ACRE;
  const height = ITEM_ACRES_HEIGHT * ITEM_TILES_PER_ACRE;
  const count = width * height;
  const layerBytes = count * 8;
  check(o.fieldItem + layerBytes * 2 + count * 2, "field items");
  const layer = (index: 0 | 1): ItemLayer => {
    const raw = new BigUint64Array(count);
    const base = o.fieldItem + index * layerBytes;
    for (let i = 0; i < count; i++) raw[i] = dv.getBigUint64(base + i * 8, true);
    const fStart = o.fieldItem + layerBytes * 2 + index * count;
    return { width, height, raw, flags: main.slice(fStart, fStart + count) };
  };

  const buildings = readBuildings(main, o.mainFieldStructure);

  const acreCount = WORLD_ACRES.w * WORLD_ACRES.h;
  check(o.outsideField + acreCount * 2 + 12, "acre layout");
  const acres = new Uint16Array(acreCount);
  for (let i = 0; i < acreCount; i++) acres[i] = dv.getUint16(o.outsideField + i * 2, true);
  const plazaBase = o.outsideField + acreCount * 2;

  return {
    terrain,
    items: [layer(0), layer(1)],
    buildings,
    acres,
    acreWidth: 9,
    acreHeight: 8,
    plaza: { x: dv.getUint32(plazaBase + 4, true), z: dv.getUint32(plazaBase + 8, true) },
  };
}
