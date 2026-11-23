import observed from "../generated/terrain-observed.json";
import type { Revision } from "../save/revisions";
import { isNone } from "./footprint";
import { BUILDING_ITEM_TILES, itemToWorld, PLAZA_ITEM_TILES, TERRAIN_ORIGIN_TILES } from "./geometry";
import { classifyUnit, groundAt, staticClassAt, type UnitClass } from "./ground";
import { skipsGroundRule } from "./buildingTypes";
import { groundReason } from "./placement";
import type { MapData } from "./mapData";
import type { PlaceCtx } from "./placement";
import { TERRAIN_TILE_SIZE } from "./terrainTile";

export type TerrainTileValue = {
  unitModel: number;
  variation: number;
  angle: number;
  roadModel: number;
  roadVariation: number;
  roadAngle: number;
  elevation: number;
};
export type TerrainEditOp = { op: "terrainEdit"; label: string; changes: { x: number; y: number; tile: TerrainTileValue }[] };
export type TerrainWrite = { index: number; tile: TerrainTileValue };

export const MAX_TERRAIN_EDIT_CHANGES = 112 * 96;
const FIELDS = ["unitModel", "variation", "angle", "roadModel", "roadVariation", "roadAngle", "elevation"] as const;

const table = observed as unknown as { ground: Record<string, number>; road: Record<string, number>; elevation: Partial<Record<UnitClass, [number, number]>> };

/** The seven stored fields of terrain tile `index` (column-major, height * x + y). */
export function terrainTileAt(map: Pick<MapData, "terrain">, index: number): TerrainTileValue {
  const t = map.terrain;
  return {
    unitModel: t.unitModel[index]!, variation: t.variation[index]!, angle: t.angle[index]!,
    roadModel: t.roadModel[index]!, roadVariation: t.roadVariation[index]!, roadAngle: t.roadAngle[index]!, elevation: t.elevation[index]!,
  };
}

const same = (a: TerrainTileValue, b: TerrainTileValue) => FIELDS.every((f) => a[f] === b[f]);

/**
 * Plans a `terrainEdit` against `ctx.map` without touching it: the net tile changes by ascending index.
 * Only dynamic-acre tiles are editable; a changed ground or road triple must be one seen in real saves and a changed
 * elevation must lie in the observed range of the ground's class. Duplicate coordinates: last wins. Throws on the first failure.
 */
export function planTerrainEdit(ctx: PlaceCtx, op: TerrainEditOp): TerrainWrite[] {
  if (op.changes.length > MAX_TERRAIN_EDIT_CHANGES) throw new RangeError(`a terrain edit may change at most ${MAX_TERRAIN_EDIT_CHANGES} tiles, got ${op.changes.length}`);
  const t = ctx.map.terrain;
  const last = new Map<number, TerrainTileValue>();
  for (const c of op.changes) {
    if (!Number.isInteger(c.x) || !Number.isInteger(c.y) || c.x < 0 || c.y < 0 || c.x >= t.width || c.y >= t.height) throw new RangeError(`tile (${c.x}, ${c.y}) is outside the terrain`);
    for (const f of FIELDS) {
      const v = c.tile[f];
      if (!Number.isInteger(v) || v < 0 || v > 0xffff) throw new RangeError(`${f} must be a whole number from 0 to 65535, got ${v}`);
    }
    if (staticClassAt(ctx, c.x + TERRAIN_ORIGIN_TILES, c.y + TERRAIN_ORIGIN_TILES) !== null) throw new RangeError(`tile (${c.x}, ${c.y}) is in a fixed acre`);
    last.set(t.height * c.x + c.y, c.tile);
  }
  const out: TerrainWrite[] = [];
  for (const index of [...last.keys()].sort((a, b) => a - b)) {
    const next = last.get(index)!;
    const cur = terrainTileAt(ctx.map, index);
    if (same(cur, next)) continue;
    const x = Math.floor(index / t.height), y = index % t.height;
    if ((next.unitModel !== cur.unitModel || next.variation !== cur.variation || next.angle !== cur.angle) && !(`${next.unitModel},${next.variation},${next.angle}` in table.ground))
      throw new RangeError(`tile (${x}, ${y}): ground combination not seen in real saves`);
    if ((next.roadModel !== cur.roadModel || next.roadVariation !== cur.roadVariation || next.roadAngle !== cur.roadAngle) && !(`${next.roadModel},${next.roadVariation},${next.roadAngle}` in table.road))
      throw new RangeError(`tile (${x}, ${y}): road combination not seen in real saves`);
    if (next.elevation !== cur.elevation) {
      const r = table.elevation[classifyUnit(next.unitModel)];
      if (!r || next.elevation < r[0] || next.elevation > r[1]) throw new RangeError(`tile (${x}, ${y}): elevation out of the observed range`);
    }
    out.push({ index, tile: next });
  }
  strandCheck(ctx, out);
  return out;
}

/** Refuses writes that turn land into non-land under an item, building or the plaza (pre-existing non-land is ignored). */
function strandCheck(ctx: PlaceCtx, writes: TerrainWrite[]): void {
  if (writes.length === 0) return;
  const { map } = ctx;
  const t = map.terrain;
  const after: PlaceCtx = { ...ctx, map: { ...map, terrain: { ...t, unitModel: t.unitModel.slice() } } };
  for (const w of writes) after.map.terrain.unitModel[w.index] = w.tile.unitModel;
  const acreW = map.items[0].width / 32;
  const origin = itemToWorld(acreW, 0, 0);
  const { width: W, height: H } = map.items[0];
  for (const w of writes) {
    const tx = Math.floor(w.index / t.height), ty = w.index % t.height;
    for (let dx = 0; dx < 2; dx++)
      for (let dy = 0; dy < 2; dy++) {
        const wx = 2 * (tx + TERRAIN_ORIGIN_TILES) + dx, wy = 2 * (ty + TERRAIN_ORIGIN_TILES) + dy;
        const ix = wx - origin.x, iy = wy - origin.y;
        if (ix < 0 || iy < 0 || ix >= W || iy >= H) continue;
        if (groundAt(ctx, ix, iy) !== "land") continue;
        const g = groundAt(after, ix, iy);
        if (g === "land") continue;
        const why = `would stand on ${groundReason(g)}`;
        for (let l = 0; l < 2; l++) if (!isNone(map.items[l]!.raw[H * ix + iy]!)) throw new RangeError(`item (layer ${l + 1}) at (${ix}, ${iy}) ${why}`);
        map.buildings.forEach((b, slot) => {
          if (b.type !== 0 && !skipsGroundRule(b.type) && wx >= b.x && wx < b.x + BUILDING_ITEM_TILES && wy >= b.y && wy < b.y + BUILDING_ITEM_TILES) throw new RangeError(`building in slot ${slot} ${why}`);
        });
        const p = map.plaza;
        if (wx >= p.x && wx < p.x + PLAZA_ITEM_TILES.w && wy >= p.z && wy < p.z + PLAZA_ITEM_TILES.h) throw new RangeError(`the plaza ${why}`);
      }
  }
}

/** Writes planned tiles into main.dat bytes (14-byte records, u16 LE fields, column-major); untouched records keep their bytes. */
export function writeTerrain(main: Uint8Array, rev: Revision, writes: TerrainWrite[]): void {
  const dv = new DataView(main.buffer, main.byteOffset, main.byteLength);
  for (const w of writes) {
    const o = rev.mainOffsets.landMakingMap + w.index * TERRAIN_TILE_SIZE;
    FIELDS.forEach((f, i) => dv.setUint16(o + i * 2, w.tile[f], true));
  }
}
