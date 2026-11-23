import { classifyUnit, type MapData } from "@nhse/core";
import { acreTileColor, renderTerrainRGBA, WORLD_TILES } from "../map/terrainImage";
import { BANK_RGB, CLIFF_RGB, LEVEL_HEIGHT, WATER_CLASSES, WATER_Y } from "./constants";

const W = WORLD_TILES.w, H = WORLD_TILES.h; // 144 x 128 world terrain tiles, 2 world units each
const TILE = 2;
const ORIGIN = 16; // terrain grid starts one acre in

export type TileField = { width: number; height: number; y: Float32Array; water: Uint8Array; rgb: Uint8Array };
export type MeshData = { positions: Float32Array; colors: Float32Array; indices: Uint32Array };

/** Per world terrain tile (index `wy * 144 + wx`): ground height, water flag and 2D-map colour. */
export function buildTileField(map: MapData, acreTiles: Uint8Array): TileField {
  const t = map.terrain;
  const y = new Float32Array(W * H);
  const water = new Uint8Array(W * H);
  const px = renderTerrainRGBA(t, map.acres, acreTiles, 1).pixels;
  const rgb = new Uint8Array(W * H * 3);
  for (let wy = 0; wy < H; wy++) {
    for (let wx = 0; wx < W; wx++) {
      const i = wy * W + wx;
      rgb.set([px[i * 4]!, px[i * 4 + 1]!, px[i * 4 + 2]!], i * 3);
      const acre = map.acres[9 * (wy >> 4) + (wx >> 4)] ?? 0;
      if (acre !== 0 && acreTileColor(acreTiles, acre, wx & 15, wy & 15) !== null) {
        const wet = WATER_CLASSES.has(acreTiles[acre * 256 + (wy & 15) * 16 + (wx & 15)]!);
        y[i] = wet ? WATER_Y : 0;
        water[i] = wet ? 1 : 0;
        continue;
      }
      const tx = wx - ORIGIN, ty = wy - ORIGIN;
      if (tx >= 0 && ty >= 0 && tx < t.width && ty < t.height) {
        const k = t.height * tx + ty;
        const cls = classifyUnit(t.unitModel[k]!);
        if (cls === "river" || cls === "fall") {
          y[i] = WATER_Y;
          water[i] = 1;
        } else y[i] = t.elevation[k]! * LEVEL_HEIGHT;
      } else {
        y[i] = WATER_Y;
        water[i] = 1;
      }
    }
  }
  return { width: W, height: H, y, water, rgb };
}

/** Ground height at a world position (x, z in item-tile units); clamps to the grid. */
export function heightAt(f: TileField, x: number, z: number): number {
  const wx = Math.min(f.width - 1, Math.max(0, Math.floor(x / TILE)));
  const wz = Math.min(f.height - 1, Math.max(0, Math.floor(z / TILE)));
  return f.y[wz * f.width + wx]!;
}

/**
 * One flat quad per tile plus a vertical wall quad on every east/south edge where heights differ.
 * Tiles marked in `replaced` (index `wy * width + wx`) are drawn as game pieces instead: they emit no quad and no wall on any edge they touch.
 */
export function buildTerrainMesh(f: TileField, replaced?: Uint8Array): MeshData {
  const { width: w, height: h } = f;
  const walls: number[][] = []; // [x0,z0,x1,z1,yLow,yHigh, r,g,b]
  for (let wy = 0; wy < h; wy++) {
    for (let wx = 0; wx < w; wx++) {
      const i = wy * w + wx;
      // east neighbour: the shared edge runs along z at x = (wx+1)*2; south neighbour: along x at z = (wy+1)*2
      const edges: [number, [number, number, number, number]][] = [];
      if (wx + 1 < w) edges.push([i + 1, [(wx + 1) * TILE, wy * TILE, (wx + 1) * TILE, (wy + 1) * TILE]]);
      if (wy + 1 < h) edges.push([i + w, [wx * TILE, (wy + 1) * TILE, (wx + 1) * TILE, (wy + 1) * TILE]]);
      for (const [j, [x0, z0, x1, z1]] of edges) {
        const a = f.y[i]!, b = f.y[j]!;
        if (a === b || replaced?.[i] || replaced?.[j]) continue;
        const lowWater = (a < b ? f.water[i] : f.water[j]) === 1;
        const [r, g, bl] = lowWater ? BANK_RGB : CLIFF_RGB;
        walls.push([x0, z0, x1, z1, Math.min(a, b), Math.max(a, b), r, g, bl]);
      }
    }
  }
  let tiles = w * h;
  if (replaced) for (let i = 0; i < w * h; i++) if (replaced[i]) tiles--;
  const quads = tiles + walls.length;
  const positions = new Float32Array(quads * 12);
  const colors = new Float32Array(quads * 12);
  const indices = new Uint32Array(quads * 6);
  const put = (q: number, v: number[], c: number[]) => {
    positions.set(v, q * 12);
    for (let k = 0; k < 4; k++) colors.set([c[0]! / 255, c[1]! / 255, c[2]! / 255], q * 12 + k * 3);
    indices.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3], q * 6);
  };
  let q = 0;
  for (let wy = 0; wy < h; wy++) {
    for (let wx = 0; wx < w; wx++) {
      const i = wy * w + wx;
      if (replaced?.[i]) continue;
      const x0 = wx * TILE, z0 = wy * TILE, y = f.y[i]!;
      put(q++, [x0, y, z0, x0 + TILE, y, z0, x0 + TILE, y, z0 + TILE, x0, y, z0 + TILE], [f.rgb[i * 3]!, f.rgb[i * 3 + 1]!, f.rgb[i * 3 + 2]!]);
    }
  }
  walls.forEach((s, n) => {
    const [x0, z0, x1, z1, lo, hi] = s as [number, number, number, number, number, number];
    put(q + n, [x0, lo, z0, x1, lo, z1, x1, hi, z1, x0, hi, z0], [s[6]!, s[7]!, s[8]!]);
  });
  return { positions, colors, indices };
}
