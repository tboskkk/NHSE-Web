import type { TerrainLayer } from "@nhse/core";
import { OCEAN_RGBA, terrainColor } from "./terrainPalette";

/** Number of acre templates in outside.bin (OutsideAcre up to FldOutNGardenRFront00). */
export const ACRE_TEMPLATE_COUNT = 318;
const DYNAMIC_CLASS = 7; // upstream "Null": defer to terrain-based color

// Upstream TileCollisionUtil.Dict, as 0xRRGGBB.
const CLASS_COLORS: Record<number, number> = {
  0: 0x467840, 1: 0x80d7c3, 3: 0xc0c0c0, 4: 0xf0e6aa, 5: 0x80d7c3, 6: 0xff8080, 8: 0x202020, 9: 0xff0000, 10: 0x303030,
  12: 0x80d7c3, 15: 0x80d7c3, 22: 0xbe6262, 28: 0xff0000, 29: 0xe8dea2, 41: 0x767a84, 42: 0x808593, 43: 0x00ffff, 44: 0x3e7038,
  45: 0x767a84, 46: 0x78cfbb, 47: 0x808000, 49: 0xbe6262, 51: 0x209820, 70: 0x6d717c, 149: 0xb3cffc, 150: 0x3d77d4,
};

/** RGB of a tile class, or null for the dynamic ("Null") class or an unknown class. */
export function classColor(cls: number): number | null {
  return cls === DYNAMIC_CLASS ? null : (CLASS_COLORS[cls] ?? null);
}

/** Port of AcreTileColor.GetAcreTileColor over the exported 16x16-per-acre class table: signed ARGB int, or null when dynamic. */
export function acreTileColor(tiles: Uint8Array, acre: number, x: number, y: number): number | null {
  if (acre < 0 || acre >= ACRE_TEMPLATE_COUNT) return null;
  const rgb = classColor(tiles[acre * 256 + y * 16 + x]!);
  return rgb === null ? null : (0xff000000 | rgb) | 0;
}

export const WORLD_TILES = { w: 9 * 16, h: 8 * 16 } as const; // terrain-resolution tiles of the whole 9x8-acre map
const TERRAIN_ORIGIN = 16; // terrain grid starts one acre in

/**
 * Renders the whole world (deep sea and shore included) at `scale` px per terrain tile.
 * Acre templates colour predefined tiles; dynamic tiles use the palette inside the terrain grid, ocean outside it.
 */
export function renderTerrainRGBA(t: TerrainLayer, acres: Uint16Array, acreTiles: Uint8Array, scale: number): { width: number; height: number; pixels: Uint8ClampedArray } {
  const width = WORLD_TILES.w * scale;
  const height = WORLD_TILES.h * scale;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let wy = 0; wy < WORLD_TILES.h; wy++) {
    for (let wx = 0; wx < WORLD_TILES.w; wx++) {
      const acre = acres[9 * (wy >> 4) + (wx >> 4)] ?? 0;
      let rgb: number | null = null;
      if (acre !== 0) {
        const c = acreTileColor(acreTiles, acre, wx & 15, wy & 15);
        if (c !== null) rgb = c & 0xffffff;
      }
      if (rgb === null) {
        const tx = wx - TERRAIN_ORIGIN;
        const ty = wy - TERRAIN_ORIGIN;
        if (tx >= 0 && ty >= 0 && tx < t.width && ty < t.height) {
          const i = t.height * tx + ty;
          rgb = terrainColor(t.unitModel[i]!, t.elevation[i]!, t.roadModel[i]!);
        }
      }
      const [r, g, b] = rgb === null ? OCEAN_RGBA : [(rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255];
      for (let sy = 0; sy < scale; sy++)
        for (let sx = 0; sx < scale; sx++) {
          const o = ((wy * scale + sy) * width + wx * scale + sx) * 4;
          pixels[o] = r!; pixels[o + 1] = g!; pixels[o + 2] = b!; pixels[o + 3] = 255;
        }
    }
  }
  return { width, height, pixels };
}
