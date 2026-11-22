import { clearFlagBit } from "./flags";
import { EXTENSION_ID, isExtension, isNone, itemFootprint, makeExtension, NONE_RAW } from "./footprint";
import type { Revision } from "../save/revisions";
import type { MapData } from "./mapData";
import { checkPlacement, footprintTiles, type PlaceCtx, rootOf } from "./placement";

export type MapEditOp = { op: "mapEdit"; layer: 0 | 1; label: string; changes: { x: number; y: number; raw: string }[] };
export type TileWrite = { index: number; raw: bigint };

export const MAX_MAP_EDIT_CHANGES = 288 * 192;

/** Mutable working copy of one item layer with atomic place/erase; the caller's map is never mutated. */
export class LayerEditor {
  readonly work: BigUint64Array;
  readonly view: MapData;
  private readonly ctx: PlaceCtx;
  private readonly src: MapData["items"][0];
  private readonly touched = new Set<number>();

  constructor(ctx: PlaceCtx, readonly layer: 0 | 1) {
    this.src = ctx.map.items[layer];
    this.work = new BigUint64Array(this.src.raw);
    this.view = { ...ctx.map, items: ctx.map.items.map((l, i) => (i === layer ? { ...l, raw: this.work } : l)) as MapData["items"] };
    this.ctx = { map: this.view, acreTiles: ctx.acreTiles };
  }

  private set(x: number, y: number, raw: bigint) {
    const i = this.src.height * x + y;
    this.work[i] = raw;
    this.touched.add(i);
  }

  /** Tile indices that erasing the item covering (x, y) would clear (none if empty). */
  coveredBy(x: number, y: number): number[] {
    const H = this.src.height;
    const r = rootOf(this.view, this.layer, x, y);
    if (!r) return [];
    if (r.orphan) return [H * x + y];
    const out: number[] = [];
    for (const t of footprintTiles(r.raw, r.x, r.y)) {
      if (t.x >= this.src.width || t.y >= H) continue;
      const cur = this.work[H * t.x + t.y]!;
      if ((t.x === r.x && t.y === r.y) || (isExtension(cur) && ((cur >> 32n) & 0xffffn) === (r.raw & 0xffffn))) out.push(H * t.x + t.y);
    }
    return out;
  }

  /** Erases the whole item covering (x, y); returns how many tiles were cleared. */
  erase(x: number, y: number): number {
    const idx = this.coveredBy(x, y);
    const H = this.src.height;
    for (const i of idx) this.set(Math.floor(i / H), i % H, NONE_RAW);
    return idx.length;
  }

  /** Places `raw` rooted at (x, y). `replace` clears the items it covers first. Returns null on success, else the refusal reason (nothing changed). */
  place(x: number, y: number, raw: bigint, replace: boolean): string | null {
    const H = this.src.height;
    const fp = itemFootprint(raw);
    const free = new Set<number>();
    if (replace)
      for (let ix = 0; ix < fp.w; ix++)
        for (let iy = 0; iy < fp.h; iy++)
          if (x + ix < this.src.width && y + iy < H) for (const i of this.coveredBy(x + ix, y + iy)) free.add(i);
    const why = checkPlacement(this.ctx, this.layer, x, y, raw, { ignore: free });
    if (why) return why;
    for (const i of free) this.set(Math.floor(i / H), i % H, NONE_RAW);
    this.set(x, y, raw);
    for (let ix = 0; ix < fp.w; ix++) for (let iy = 0; iy < fp.h; iy++) if (ix || iy) this.set(x + ix, y + iy, makeExtension(raw, ix, iy));
    return null;
  }

  /** Swaps the item rooted at (x, y) for `raw` at the same root; only the old item's own tiles count as free. Null on success, else the reason (nothing changed). */
  replaceRoot(x: number, y: number, raw: bigint): string | null {
    const H = this.src.height;
    const free = new Set(this.coveredBy(x, y));
    const why = checkPlacement(this.ctx, this.layer, x, y, raw, { ignore: free });
    if (why) return why;
    for (const i of free) this.set(Math.floor(i / H), i % H, NONE_RAW);
    this.set(x, y, raw);
    const fp = itemFootprint(raw);
    for (let ix = 0; ix < fp.w; ix++) for (let iy = 0; iy < fp.h; iy++) if (ix || iy) this.set(x + ix, y + iy, makeExtension(raw, ix, iy));
    return null;
  }

  /** Net changes versus the source layer, by ascending tile index. */
  writes(): TileWrite[] {
    const out: TileWrite[] = [];
    for (const index of [...this.touched].sort((a, b) => a - b)) if (this.work[index] !== this.src.raw[index]) out.push({ index, raw: this.work[index]! });
    return out;
  }
}

/**
 * Plans a `mapEdit` against `ctx.map` without touching it: returns every tile that changes (column-major index) with its new raw.
 * A change with raw id 0xfffe erases the whole footprint covering (x, y); any other raw is rooted at (x, y), replacing the
 * footprints it overlaps. Placements obey checkPlacement (the replaced tiles count as free). Throws on the first failure.
 */
export function planMapEdit(ctx: PlaceCtx, op: MapEditOp): TileWrite[] {
  if (op.layer !== 0 && op.layer !== 1) throw new RangeError(`layer must be 0 or 1, got ${op.layer}`);
  if (op.changes.length > MAX_MAP_EDIT_CHANGES) throw new RangeError(`a map edit may change at most ${MAX_MAP_EDIT_CHANGES} tiles, got ${op.changes.length}`);
  const src = ctx.map.items[op.layer];
  const ed = new LayerEditor(ctx, op.layer);
  for (const c of op.changes) {
    if (!Number.isInteger(c.x) || !Number.isInteger(c.y) || c.x < 0 || c.y < 0 || c.x >= src.width || c.y >= src.height)
      throw new RangeError(`tile (${c.x}, ${c.y}) is outside the item layer`);
    if (!/^[0-9a-fA-F]{16}$/.test(c.raw)) throw new Error(`Item raw must be 16 hex digits, got "${c.raw}"`);
    const raw = BigInt("0x" + c.raw);
    if (isNone(raw)) {
      ed.erase(c.x, c.y);
      continue;
    }
    if (Number(raw & 0xffffn) === EXTENSION_ID) throw new RangeError("extension tiles cannot be placed directly");
    const why = ed.place(c.x, c.y, raw, true);
    if (why) throw new RangeError(`Cannot place at (${c.x}, ${c.y}): ${why}`);
  }
  return ed.writes();
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
