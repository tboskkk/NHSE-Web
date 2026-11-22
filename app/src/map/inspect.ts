import type { MapData } from "@nhse/core";
import { BUILDING_TILES, PX_PER_ITEM_TILE, type Layout } from "./layout";

export type Inspection = {
  terrain: { x: number; y: number; unitModel: number; variation: number; angle: number; roadModel: number; roadVariation: number; roadAngle: number; elevation: number } | null;
  items: { layer: 0 | 1; x: number; y: number; raw: string; id: number; count: number }[];
  building: { index: number; type: number } | null;
  /** True when nothing is under the cursor (off the island). */
  empty: boolean;
};

const NONE = 0xfffe;
const EXTENSION = 0xfffd;

/** Read-only description of the hovered terrain tile and item tile (either may be null when off that grid). */
export function inspectTile(map: MapData, layout: Layout, terrain: { x: number; y: number } | null, item: { x: number; y: number } | null): Inspection {
  const t = terrain && {
    x: terrain.x,
    y: terrain.y,
    ...(() => {
      const i = map.terrain.height * terrain.x + terrain.y;
      const g = map.terrain;
      return { unitModel: g.unitModel[i]!, variation: g.variation[i]!, angle: g.angle[i]!, roadModel: g.roadModel[i]!, roadVariation: g.roadVariation[i]!, roadAngle: g.roadAngle[i]!, elevation: g.elevation[i]! };
    })(),
  };

  const items: Inspection["items"] = [];
  let building: Inspection["building"] = null;
  if (item) {
    for (const layer of [0, 1] as const) {
      const L = map.items[layer];
      const raw = L.raw[L.height * item.x + item.y]!;
      const id = Number(raw & 0xffffn);
      if (id === NONE || id === EXTENSION) continue;
      items.push({ layer, x: item.x, y: item.y, raw: raw.toString(16).padStart(16, "0"), id, count: Number((raw >> 32n) & 0xffffn) });
    }
    const wx = layout.items.originX / PX_PER_ITEM_TILE + item.x;
    const wy = layout.items.originY / PX_PER_ITEM_TILE + item.y;
    map.buildings.forEach((b, index) => {
      if (!building && b.type !== 0 && wx >= b.x && wx < b.x + BUILDING_TILES && wy >= b.y && wy < b.y + BUILDING_TILES) building = { index, type: b.type };
    });
  }
  return { terrain: t, items, building, empty: !t && !item };
}
