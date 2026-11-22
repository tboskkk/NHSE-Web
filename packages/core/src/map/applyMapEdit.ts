import { clearFlagBit } from "./flags";
import { EXTENSION_ID, isExtension, isNone, itemFootprint, makeExtension, NONE_RAW } from "./footprint";
import type { Revision } from "../save/revisions";
import { checkPlacement, footprintTiles, type PlaceCtx, rootOf } from "./placement";

export type MapEditOp = { op: "mapEdit"; layer: 0 | 1; label: string; changes: { x: number; y: number; raw: string }[] };
export type TileWrite = { index: number; raw: bigint };

export const MAX_MAP_EDIT_CHANGES = 288 * 192;

/**
 * Plans a `mapEdit` against `ctx.map` without touching it: returns every tile that changes (column-major index) with its new raw.
 * A change with raw id 0xfffe erases the whole footprint covering (x, y); any other raw is rooted at (x, y), replacing the
 * footprints it overlaps. Placements obey checkPlacement (the replaced tiles count as free). Throws on the first failure.
 */
export function planMapEdit(ctx: PlaceCtx, op: MapEditOp): TileWrite[] {
  if (op.layer !== 0 && op.layer !== 1) throw new RangeError(`layer must be 0 or 1, got ${op.layer}`);
  if (op.changes.length > MAX_MAP_EDIT_CHANGES) throw new RangeError(`a map edit may change at most ${MAX_MAP_EDIT_CHANGES} tiles, got ${op.changes.length}`);
  const src = ctx.map.items[op.layer];
  const H = src.height;
  const work = new BigUint64Array(src.raw); // copy: the caller's map is never mutated
  const view = { ...ctx.map, items: ctx.map.items.map((l, i) => (i === op.layer ? { ...l, raw: work } : l)) as typeof ctx.map.items };
  const wctx: PlaceCtx = { map: view, acreTiles: ctx.acreTiles };
  const touched = new Set<number>();

  const set = (x: number, y: number, raw: bigint) => {
    const i = H * x + y;
    work[i] = raw;
    touched.add(i);
  };
  /** Erases the footprint of the item covering (x, y); returns the tile indices cleared. */
  const eraseAt = (x: number, y: number): number[] => {
    const r = rootOf(view, op.layer, x, y);
    if (!r) return [];
    if (r.orphan) {
      set(x, y, NONE_RAW);
      return [H * x + y];
    }
    const cleared: number[] = [];
    for (const t of footprintTiles(r.raw, r.x, r.y)) {
      if (t.x >= src.width || t.y >= H) continue;
      const cur = work[H * t.x + t.y]!;
      const isThis = (t.x === r.x && t.y === r.y) || (isExtension(cur) && ((cur >> 32n) & 0xffffn) === (r.raw & 0xffffn));
      if (!isThis) continue;
      set(t.x, t.y, NONE_RAW);
      cleared.push(H * t.x + t.y);
    }
    return cleared;
  };

  for (const c of op.changes) {
    if (!Number.isInteger(c.x) || !Number.isInteger(c.y) || c.x < 0 || c.y < 0 || c.x >= src.width || c.y >= H)
      throw new RangeError(`tile (${c.x}, ${c.y}) is outside the item layer`);
    if (!/^[0-9a-fA-F]{16}$/.test(c.raw)) throw new Error(`Item raw must be 16 hex digits, got "${c.raw}"`);
    const raw = BigInt("0x" + c.raw);
    if (isNone(raw)) {
      eraseAt(c.x, c.y);
      continue;
    }
    if (Number(raw & 0xffffn) === EXTENSION_ID) throw new RangeError("extension tiles cannot be placed directly");
    const fp = itemFootprint(raw);
    const free = new Set<number>();
    // replace: clear every item whose footprint the new one covers
    for (let ix = 0; ix < fp.w; ix++)
      for (let iy = 0; iy < fp.h; iy++) {
        const x = c.x + ix, y = c.y + iy;
        if (x < src.width && y < H) for (const i of eraseAt(x, y)) free.add(i);
      }
    const why = checkPlacement(wctx, op.layer, c.x, c.y, raw, { ignore: free });
    if (why) throw new RangeError(`Cannot place at (${c.x}, ${c.y}): ${why}`);
    set(c.x, c.y, raw);
    for (let ix = 0; ix < fp.w; ix++) for (let iy = 0; iy < fp.h; iy++) if (ix || iy) set(c.x + ix, c.y + iy, makeExtension(raw, ix, iy));
  }

  const out: TileWrite[] = [];
  for (const index of [...touched].sort((a, b) => a - b)) if (work[index] !== src.raw[index]) out.push({ index, raw: work[index]! });
  return out;
}

/** Writes planned tiles into main.dat bytes (column-major u64 LE) and clears flags of removed items per flagPolicy. */
export function writeTiles(main: Uint8Array, rev: Revision, layer: 0 | 1, height: number, width: number, tiles: TileWrite[], previous: BigUint64Array): void {
  const dv = new DataView(main.buffer, main.byteOffset, main.byteLength);
  const base = rev.mainOffsets.fieldItem + layer * width * height * 8;
  for (const t of tiles) {
    dv.setBigUint64(base + t.index * 8, t.raw, true);
    if (!isNone(previous[t.index]!) && isNone(t.raw)) clearFlagBit(main, rev, layer, Math.floor(t.index / height), t.index % height);
  }
}
