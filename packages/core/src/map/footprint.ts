import items from "../generated/items.json";

const tables = items as unknown as { itemSizes: number[]; itemSizeTypes: { w: number; h: number }[] };

export const NONE_RAW = 0xfffen;
export const EXTENSION_ID = 0xfffd;

const idOf = (raw: bigint) => Number(raw & 0xffffn);
const systemParam = (raw: bigint) => Number((raw >> 16n) & 0xffn);

export const isExtension = (raw: bigint): boolean => idOf(raw) === EXTENSION_ID;
export const isNone = (raw: bigint): boolean => idOf(raw) === 0xfffe;

/** Upstream `ItemInfo.GetItemSize` in item-tile units (a 1x1 item is 2x2 tiles), rotation-swapped. Extension tiles use their root's id. */
export function itemFootprint(raw: bigint): { w: number; h: number; unknownSize: boolean } {
  const sp = systemParam(raw);
  const id = isExtension(raw) ? Number((raw >> 32n) & 0xffffn) : idOf(raw);
  const buriedOrDropped = (sp & 0x04) !== 0 || (sp & 0x20) !== 0;
  const lookup = buriedOrDropped ? 4 /* S_1_0x1_0 */ : (tables.itemSizes[id] ?? 255);
  const unknownSize = !buriedOrDropped && id >= tables.itemSizes.length;
  const t = tables.itemSizeTypes[lookup];
  let w = t?.w ?? 2;
  let h = t?.h ?? 2;
  if ((sp & 3 & 1) === 1) [w, h] = [h, w];
  return { w, h, unknownSize };
}

/** Upstream `Item.SetAsExtension`: id 0xfffd, root id at bytes 4-5, offsets at bytes 6-7, params cleared. */
export function makeExtension(rootRaw: bigint, dx: number, dy: number): bigint {
  return BigInt(EXTENSION_ID) | (rootRaw & 0xffffn) << 32n | BigInt(dx & 0xff) << 48n | BigInt(dy & 0xff) << 56n;
}
