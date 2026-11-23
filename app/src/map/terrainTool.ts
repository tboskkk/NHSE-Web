import { terrainTileAt, type MapData, type TerrainEditOp, type TerrainTileValue } from "@nhse/core";

export type TerrainMode = "stamp" | "elevation" | "rotate" | "clearRoad";
export type StampPart = "ground" | "road" | "both";
type Tile = { x: number; y: number };
type Change = TerrainEditOp["changes"][number];

const FIELDS = ["unitModel", "variation", "angle", "roadModel", "roadVariation", "roadAngle", "elevation"] as const;
const inside = (m: MapData, t: Tile) => Number.isInteger(t.x) && Number.isInteger(t.y) && t.x >= 0 && t.y >= 0 && t.x < m.terrain.width && t.y < m.terrain.height;
const idx = (m: MapData, t: Tile) => m.terrain.height * t.x + t.y;
const differs = (a: TerrainTileValue, b: TerrainTileValue) => FIELDS.some((f) => a[f] !== b[f]);

/** Builds the op from `edit(current)` per in-range tile, keeping only tiles that actually change; `edit` returns null to skip. */
function build(map: MapData, label: string, tiles: Tile[], edit: (cur: TerrainTileValue) => TerrainTileValue | null): TerrainEditOp {
  const changes: Change[] = [];
  for (const t of tiles) {
    if (!inside(map, t)) continue;
    const cur = terrainTileAt(map, idx(map, t));
    const next = edit(cur);
    if (next && differs(cur, next)) changes.push({ x: t.x, y: t.y, tile: next });
  }
  return { op: "terrainEdit", label, changes };
}

/** Bounds-checked read of one terrain tile for the picker. */
export function terrainTileUnder(map: MapData, t: Tile): TerrainTileValue | null {
  return inside(map, t) ? terrainTileAt(map, idx(map, t)) : null;
}

/** Copies the picked tile's ground and/or road onto each tile; elevation is never copied. */
export function stampOp(map: MapData, picked: TerrainTileValue, part: StampPart, tiles: Tile[]): TerrainEditOp {
  return build(map, "Stamp terrain", tiles, (c) => ({
    ...c,
    ...(part !== "road" ? { unitModel: picked.unitModel, variation: picked.variation, angle: picked.angle } : {}),
    ...(part !== "ground" ? { roadModel: picked.roadModel, roadVariation: picked.roadVariation, roadAngle: picked.roadAngle } : {}),
  }));
}

export function elevationOp(map: MapData, tiles: Tile[], delta: 1 | -1): TerrainEditOp {
  return build(map, delta === 1 ? "Raise terrain" : "Lower terrain", tiles, (c) => (c.elevation + delta < 0 ? null : { ...c, elevation: c.elevation + delta }));
}

/** Upstream TerrainTile.TryRotate: the road turns if there is one, else the ground (base ground cannot rotate). */
export function rotateOp(map: MapData, tiles: Tile[]): TerrainEditOp {
  return build(map, "Rotate terrain", tiles, (c) => {
    if (c.roadModel !== 0) return { ...c, roadAngle: (c.roadAngle + 1) & 3 };
    if (c.unitModel === 0) return null;
    return { ...c, angle: (c.angle + 1) & 3 };
  });
}

export function clearRoadOp(map: MapData, tiles: Tile[]): TerrainEditOp {
  return build(map, "Clear road", tiles, (c) => (c.roadModel === 0 && c.roadVariation === 0 && c.roadAngle === 0 ? null : { ...c, roadModel: 0, roadVariation: 0, roadAngle: 0 }));
}
