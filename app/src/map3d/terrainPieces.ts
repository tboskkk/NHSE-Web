import type { MapData } from "@nhse/core";
import { ANGLE_DIR, LEVEL_HEIGHT } from "./constants";

export type PieceInstance = { x: number; y: number; z: number; rotY: number };

const W = 144; // world terrain tiles across (see terrainMesh)
const H = 128;
const ORIGIN = 16; // the terrain grid starts one acre (16 tiles) in
const TILE = 2; // world units per terrain tile

/**
 * Terrain tiles as game pieces. A tile with a piece for its unit id (and variation, falling back to variation 0) is drawn as that
 * piece and marked in `replaced` (index `wy * 144 + wx`, so the flat mesh can skip it); a nonzero road overlay adds its road piece
 * on top without replacing the tile. Unit 0 (plain ground) and units without a piece are left to the flat mesh.
 */
export function groupTerrainPieces(map: MapData, terrain: ReadonlyMap<string, string>): { pieces: Map<string, PieceInstance[]>; replaced: Uint8Array } {
  const pieces = new Map<string, PieceInstance[]>();
  const replaced = new Uint8Array(W * H);
  if (terrain.size === 0) return { pieces, replaced };
  const t = map.terrain;
  const add = (key: string, inst: PieceInstance) => {
    const list = pieces.get(key);
    if (list) list.push(inst);
    else pieces.set(key, [inst]);
  };
  const lookup = (unit: number, variation: number) => terrain.get(`${unit}_${variation}`) ?? terrain.get(`${unit}_0`);
  for (let tx = 0; tx < t.width; tx++) {
    for (let ty = 0; ty < t.height; ty++) {
      const i = t.height * tx + ty;
      const x = (ORIGIN + tx) * TILE + TILE / 2, z = (ORIGIN + ty) * TILE + TILE / 2, y = t.elevation[i]! * LEVEL_HEIGHT;
      const unit = t.unitModel[i]!;
      if (unit !== 0) {
        const key = lookup(unit, t.variation[i]!);
        if (key) {
          add(key, { x, y, z, rotY: t.angle[i]! * (Math.PI / 2) * ANGLE_DIR });
          replaced[(ORIGIN + ty) * W + ORIGIN + tx] = 1;
        }
      }
      const road = t.roadModel[i]!;
      if (road !== 0) {
        const key = lookup(road, t.roadVariation[i]!);
        if (key) add(key, { x, y, z, rotY: t.roadAngle[i]! * (Math.PI / 2) * ANGLE_DIR });
      }
    }
  }
  return { pieces, replaced };
}
