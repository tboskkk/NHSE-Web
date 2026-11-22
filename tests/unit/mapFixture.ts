import type { MapData } from "../../packages/core/src/map/mapData";
import type { PlaceCtx } from "../../packages/core/src/map/placement";
import items from "../../packages/core/src/generated/items.json";

const t = items as unknown as { itemSizes: number[]; itemSizeTypes: { name: string }[] };
/** First item id whose size type is `name` (e.g. "S_2_0x2_0"). */
export const idOfSize = (name: string): number => t.itemSizes.findIndex((s) => t.itemSizeTypes[s]?.name === name);
export const rawOf = (id: number, systemParam = 0): bigint => BigInt(id) | (BigInt(systemParam) << 16n);

/** 288x192 two-layer map (originX = 0), flat grass terrain, every world acre a dynamic acre, no buildings. */
export function emptyMap(): MapData {
  const layer = () => ({ width: 288, height: 192, raw: new BigUint64Array(288 * 192).fill(0xfffen), flags: new Uint8Array(0) });
  const z = () => new Uint16Array(112 * 96);
  return {
    terrain: { width: 112, height: 96, unitModel: z(), variation: z(), angle: z(), roadModel: z(), roadVariation: z(), roadAngle: z(), elevation: z() },
    items: [layer(), layer()],
    buildings: [],
    acres: new Uint16Array(72),
    acreWidth: 9,
    acreHeight: 8,
    plaza: { x: 0, z: 0 },
  };
}

export const ctxOf = (map: MapData = emptyMap()): PlaceCtx => ({ map, acreTiles: new Uint8Array(318 * 256) });
