import type { MapData } from "./mapData";
import { itemToWorld, TERRAIN_ORIGIN_TILES } from "./geometry";

export type UnitClass = "base" | "river" | "cliff" | "fall" | "road" | "other";

/** Upstream TerrainUnitModel ranges. */
export function classifyUnit(m: number): UnitClass {
  if (m === 0) return "base";
  if (m >= 0x01 && m <= 0x15) return "river";
  if ((m >= 0x16 && m <= 0x29) || m === 0x93) return "cliff";
  if ((m >= 0x3a && m <= 0x46) || (m >= 0x71 && m <= 0x92)) return "fall";
  if ((m >= 0x47 && m <= 0x70) || m >= 0x94) return "road";
  return "other";
}

export type Ground = "land" | "water" | "cliff" | "blocked";

export type GroundCtx = { map: MapData; acreTiles: Uint8Array };

/** Number of acre templates in outside.bin. */
const ACRE_TEMPLATE_COUNT = 318;
const DYNAMIC_CLASS = 7;

// Upstream tile classes (TileCollisionUtil): grass, sand, beach edges are buildable.
const LAND_CLASSES = new Set([0, 4, 29, 44]);
const WATER_CLASSES = new Set([1, 5, 12, 15, 43, 46]);
const CLIFF_CLASSES = new Set([3, 41, 42, 45, 47, 70, 150]);

function fromClass(c: number): Ground {
  if (LAND_CLASSES.has(c)) return "land";
  if (WATER_CLASSES.has(c)) return "water";
  if (CLIFF_CLASSES.has(c)) return "cliff";
  return "blocked";
}

/** Ground under an item-layer tile: static acre template class if the acre has one, else the terrain layer; outside both is ocean. */
export function groundAt(ctx: GroundCtx, itemX: number, itemY: number): Ground {
  const { map, acreTiles } = ctx;
  const w = itemToWorld(map.items[0].width / 32, itemX, itemY);
  const twx = w.x >> 1;
  const twy = w.y >> 1;
  const acre = map.acres[9 * (twy >> 4) + (twx >> 4)] ?? 0;
  if (acre !== 0 && acre < ACRE_TEMPLATE_COUNT) {
    const c = acreTiles[acre * 256 + (twy & 15) * 16 + (twx & 15)]!;
    if (c !== DYNAMIC_CLASS) return fromClass(c);
  }
  const tx = twx - TERRAIN_ORIGIN_TILES;
  const ty = twy - TERRAIN_ORIGIN_TILES;
  const t = map.terrain;
  if (tx < 0 || ty < 0 || tx >= t.width || ty >= t.height) return "water";
  const i = t.height * tx + ty;
  switch (classifyUnit(t.unitModel[i]!)) {
    case "base":
    case "road":
      return "land";
    case "river":
    case "fall":
      return "water";
    case "cliff":
      return "cliff";
    default:
      return "blocked";
  }
}
