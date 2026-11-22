import { EXTENSION_ID, isExtension, isNone, itemFootprint } from "./footprint";
import { BUILDING_ITEM_TILES, itemToWorld, PLAZA_ITEM_TILES } from "./geometry";
import { type Ground, groundAt } from "./ground";
import type { MapData } from "./mapData";

export type PlaceCtx = { map: MapData; acreTiles: Uint8Array };

const REASON: Record<Exclude<Ground, "land">, string> = { water: "water", cliff: "cliff", blocked: "blocked ground" };

/** Tiles covered by `raw` rooted at (x, y), root first, column by column. */
export function footprintTiles(raw: bigint, x: number, y: number): { x: number; y: number }[] {
  const { w, h } = itemFootprint(raw);
  const out: { x: number; y: number }[] = [];
  for (let ix = 0; ix < w; ix++) for (let iy = 0; iy < h; iy++) out.push({ x: x + ix, y: y + iy });
  return out;
}

export type RootRef = { x: number; y: number; raw: bigint; orphan: boolean };

/** The root item a tile belongs to; an extension with no matching root resolves to itself with `orphan: true`. */
export function rootOf(map: MapData, layer: 0 | 1, x: number, y: number): RootRef | null {
  const l = map.items[layer];
  if (x < 0 || y < 0 || x >= l.width || y >= l.height) return null;
  const raw = l.raw[l.height * x + y]!;
  if (isNone(raw)) return null;
  if (!isExtension(raw)) return { x, y, raw, orphan: false };
  const rx = x - Number((raw >> 48n) & 0xffn);
  const ry = y - Number((raw >> 56n) & 0xffn);
  const root = rx >= 0 && ry >= 0 && rx < l.width && ry < l.height ? l.raw[l.height * rx + ry]! : 0xfffen;
  const ok = !isNone(root) && !isExtension(root) && (root & 0xffffn) === ((raw >> 32n) & 0xffffn);
  return ok ? { x: rx, y: ry, raw: root, orphan: false } : { x, y, raw, orphan: true };
}

/** `null` if `raw` can be rooted at (x, y) on `layer`; otherwise why not. `opts.ignore` = item-layer tile indices (height*x+y) to treat as empty. */
export function checkPlacement(ctx: PlaceCtx, layer: 0 | 1, x: number, y: number, raw: bigint, opts: { ignore?: ReadonlySet<number> } = {}): string | null {
  const { map } = ctx;
  const l = map.items[layer];
  const fp = itemFootprint(raw);
  if (fp.unknownSize) return "unknown item size";
  if (Number((raw & 0xffffn)) === EXTENSION_ID || isNone(raw)) return "not a placeable item";
  if (x < 0 || y < 0 || x + fp.w > l.width || y + fp.h > l.height) return "outside the map";
  const acreW = l.width / 32;
  for (let ix = 0; ix < fp.w; ix++) {
    for (let iy = 0; iy < fp.h; iy++) {
      const g = groundAt(ctx, x + ix, y + iy);
      if (g !== "land") return REASON[g];
    }
  }
  const o = itemToWorld(acreW, x, y);
  for (const b of map.buildings) {
    if (b.type === 0) continue;
    if (o.x < b.x + BUILDING_ITEM_TILES && o.x + fp.w > b.x && o.y < b.y + BUILDING_ITEM_TILES && o.y + fp.h > b.y) return "overlaps a building";
  }
  const p = map.plaza;
  if (o.x < p.x + PLAZA_ITEM_TILES.w && o.x + fp.w > p.x && o.y < p.z + PLAZA_ITEM_TILES.h && o.y + fp.h > p.z) return "overlaps the plaza";
  for (let ix = 0; ix < fp.w; ix++) {
    for (let iy = 0; iy < fp.h; iy++) {
      const idx = l.height * (x + ix) + (y + iy);
      if (opts.ignore?.has(idx)) continue;
      if (!isNone(l.raw[idx]!)) return "overlaps another item";
    }
  }
  return null;
}
