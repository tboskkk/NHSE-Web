import type { MapData } from "@nhse/core";
import { BUILDING_TILES } from "../map/layout";
import { heightAt, type TileField } from "./terrainMesh";

export type Box = { kind: "building" | "plaza"; type: number; x: number; z: number; w: number; d: number; y: number; h: number; color: number };

const PLAZA = { w: 24, d: 20 }; // upstream plaza size in item tiles

/** Plaza plate and building boxes in world units; same skip rule as the 2D map (type 0 = unused slot). */
export function structureBoxes(map: MapData, f: TileField): Box[] {
  const boxes: Box[] = [
    { kind: "plaza", type: 0, x: map.plaza.x, z: map.plaza.z, w: PLAZA.w, d: PLAZA.d, y: heightAt(f, map.plaza.x + PLAZA.w / 2, map.plaza.z + PLAZA.d / 2), h: 0.2, color: 0xbc8f8f },
  ];
  for (const b of map.buildings) {
    if (b.type === 0) continue;
    boxes.push({ kind: "building", type: b.type, x: b.x, z: b.y, w: BUILDING_TILES, d: BUILDING_TILES, y: heightAt(f, b.x + BUILDING_TILES / 2, b.y + BUILDING_TILES / 2), h: 6, color: 0xffd400 });
  }
  return boxes;
}
