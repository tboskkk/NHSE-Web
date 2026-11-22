import type { EditOp } from "../edit/ops";
import items from "../generated/items.json";
import { LayerEditor } from "./applyMapEdit";
import { isExtension, isNone, itemFootprint, NONE_RAW } from "./footprint";
import { type PlaceCtx, rootOf } from "./placement";

export type Skipped = { x: number; y: number; reason: string };
export type Plan = {
  layer: 0 | 1;
  changes: { x: number; y: number; raw: string }[];
  skipped: Skipped[];
  counts: { placed: number; erased: number; replaced: number };
};
export type Rect = { x0: number; y0: number; x1: number; y1: number };
type Tile = { x: number; y: number };

const hex = (r: bigint) => r.toString(16).padStart(16, "0");
const NONE_HEX = hex(NONE_RAW);
const fieldItems = (items as unknown as { fieldItems: Record<string, { name: string }> }).fieldItems;

/** Field-item ids whose upstream name contains "Weed". */
export const WEED_IDS: readonly number[] = Object.entries(fieldItems).filter(([, v]) => v.name.includes("Weed")).map(([k]) => Number(k));

const newPlan = (layer: 0 | 1): Plan => ({ layer, changes: [], skipped: [], counts: { placed: 0, erased: 0, replaced: 0 } });
const layersOf = (l: 0 | 1 | "both"): (0 | 1)[] => (l === "both" ? [0, 1] : [l]);

/** Roots on a layer in tile order: {x, y, raw}. */
function* roots(ctx: PlaceCtx, layer: 0 | 1): Generator<{ x: number; y: number; raw: bigint }> {
  const l = ctx.map.items[layer];
  for (let x = 0; x < l.width; x++)
    for (let y = 0; y < l.height; y++) {
      const raw = l.raw[l.height * x + y]!;
      if (!isNone(raw) && !isExtension(raw)) yield { x, y, raw };
    }
}

function eraseRoot(ed: LayerEditor, plan: Plan, x: number, y: number): void {
  if (ed.erase(x, y) > 0) {
    plan.changes.push({ x, y, raw: NONE_HEX });
    plan.counts.erased++;
  }
}

function stamp(ed: LayerEditor, plan: Plan, x: number, y: number, raw: bigint): void {
  const why = ed.place(x, y, raw, false);
  if (why) plan.skipped.push({ x, y, reason: why });
  else {
    plan.changes.push({ x, y, raw: hex(raw) });
    plan.counts.placed++;
  }
}

/** Drag/click placement: each tile in stroke order, refusing overlaps (also with earlier stamps of the same stroke). */
export function planPlace(ctx: PlaceCtx, layer: 0 | 1, tiles: Tile[], raw: bigint): Plan {
  const ed = new LayerEditor(ctx, layer);
  const plan = newPlan(layer);
  for (const t of tiles) stamp(ed, plan, t.x, t.y, raw);
  return plan;
}

/** Erase the whole item under each tile (an extension tile resolves to its root; duplicates collapse). */
export function planErase(ctx: PlaceCtx, layer: 0 | 1, tiles: Tile[]): Plan {
  const ed = new LayerEditor(ctx, layer);
  const plan = newPlan(layer);
  for (const t of tiles) {
    const r = rootOf(ed.view, layer, t.x, t.y);
    if (r) eraseRoot(ed, plan, r.x, r.y);
  }
  return plan;
}

/** `raw === null` clears every item touching the rectangle; otherwise stamps the item on a grid stepped by its footprint. */
export function planRect(ctx: PlaceCtx, layer: 0 | 1, rect: Rect, raw: bigint | null): Plan {
  const ed = new LayerEditor(ctx, layer);
  const plan = newPlan(layer);
  const x0 = Math.min(rect.x0, rect.x1), x1 = Math.max(rect.x0, rect.x1);
  const y0 = Math.min(rect.y0, rect.y1), y1 = Math.max(rect.y0, rect.y1);
  if (raw === null) {
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++) {
        const r = rootOf(ed.view, layer, x, y);
        if (r) eraseRoot(ed, plan, r.x, r.y);
      }
    return plan;
  }
  const fp = itemFootprint(raw);
  for (let x = x0; x + fp.w - 1 <= x1; x += fp.w) for (let y = y0; y + fp.h - 1 <= y1; y += fp.h) stamp(ed, plan, x, y, raw);
  return plan;
}

/** Replace roots matching `from` (same item id, or the exact raw) with `to`; a replacement that does not fit is skipped, never partial. */
export function planReplaceAll(ctx: PlaceCtx, layer: 0 | 1 | "both", from: bigint, to: bigint, match: "id" | "exact"): Plan[] {
  return layersOf(layer).map((l) => {
    const ed = new LayerEditor(ctx, l);
    const plan = newPlan(l);
    const hit = (raw: bigint) => (match === "exact" ? raw === from : (raw & 0xffffn) === (from & 0xffffn));
    for (const r of [...roots(ctx, l)]) {
      if (!hit(r.raw)) continue;
      const why = ed.replaceRoot(r.x, r.y, to);
      if (why) plan.skipped.push({ x: r.x, y: r.y, reason: why });
      else {
        plan.changes.push({ x: r.x, y: r.y, raw: hex(to) });
        plan.counts.replaced++;
      }
    }
    return plan;
  });
}

/** Erase every root on the layer(s) for which `pred(rootRaw)` holds. */
export function planRemoveWhere(ctx: PlaceCtx, layer: 0 | 1 | "both", pred: (rootRaw: bigint) => boolean): Plan[] {
  return layersOf(layer).map((l) => {
    const ed = new LayerEditor(ctx, l);
    const plan = newPlan(l);
    for (const r of [...roots(ctx, l)]) if (pred(r.raw)) eraseRoot(ed, plan, r.x, r.y);
    return plan;
  });
}

export function planToOp(plan: Plan, label: string): EditOp {
  return { op: "mapEdit", layer: plan.layer, label, changes: plan.changes };
}
