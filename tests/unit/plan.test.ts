import { expect, test } from "bun:test";
import items from "../../packages/core/src/generated/items.json";
import { planMapEdit } from "../../packages/core/src/map/applyMapEdit";
import { NONE_RAW } from "../../packages/core/src/map/footprint";
import { planErase, planPlace, planRect, planRemoveWhere, planReplaceAll, planToOp, WEED_IDS, type Plan } from "../../packages/core/src/map/plan";
import { ctxOf, emptyMap, idOfSize, rawOf } from "./mapFixture";

const ONE = rawOf(idOfSize("S_1_0x1_0")); // 2x2 tiles
const BIG = rawOf(idOfSize("S_2_0x2_0")); // 4x4 tiles
const hex = (r: bigint) => r.toString(16).padStart(16, "0");

/** Places items straight into a fresh map through the op path so fixtures stay valid. */
function mapWith(...placed: { layer?: 0 | 1; x: number; y: number; raw: bigint }[]) {
  const m = emptyMap();
  for (const p of placed) {
    const layer = p.layer ?? 0;
    for (const w of planMapEdit(ctxOf(m), { op: "mapEdit", layer, label: "f", changes: [{ x: p.x, y: p.y, raw: hex(p.raw) }] })) m.items[layer].raw[w.index] = w.raw;
  }
  return m;
}
const replays = (ctx: ReturnType<typeof ctxOf>, p: Plan) => expect(() => planMapEdit(ctx, planToOp(p, "t"))).not.toThrow();

test("a drag skips tiles that would overlap an item and counts the rest", () => {
  const ctx = ctxOf(mapWith({ x: 104, y: 100, raw: ONE }));
  const p = planPlace(ctx, 0, [100, 102, 104, 106, 108].map((x) => ({ x, y: 100 })), ONE);
  expect(p.changes.length).toBe(4);
  expect(p.skipped).toEqual([{ x: 104, y: 100, reason: "overlaps another item" }]);
  expect(p.counts.placed).toBe(4);
  replays(ctx, p);
});

test("stamps in one drag that overlap each other skip the later one", () => {
  const p = planPlace(ctxOf(), 0, [{ x: 100, y: 100 }, { x: 101, y: 100 }], ONE);
  expect(p.changes.length).toBe(1);
  expect(p.skipped.length).toBe(1);
});

test("rectangle fill stamps on a footprint-sized grid and skips what does not fit", () => {
  const ctx = ctxOf(mapWith({ x: 108, y: 100, raw: ONE }));
  const p = planRect(ctx, 0, { x0: 100, y0: 100, x1: 107, y1: 107 }, BIG);
  expect(p.counts.placed).toBe(4);
  const q = planRect(ctx, 0, { x0: 100, y0: 100, x1: 111, y1: 101 }, ONE);
  expect(q.counts.placed).toBe(5); // 6 slots wide, one occupied
  replays(ctx, p);
});

test("rectangle clear erases whole footprints of roots that intersect it", () => {
  const ctx = ctxOf(mapWith({ x: 98, y: 98, raw: BIG }, { x: 120, y: 120, raw: ONE }));
  const p = planRect(ctx, 0, { x0: 100, y0: 100, x1: 101, y1: 101 }, null);
  expect(p.changes).toEqual([{ x: 98, y: 98, raw: hex(NONE_RAW) }]);
  expect(p.counts.erased).toBe(1);
  replays(ctx, p);
});

test("erase on an extension tile targets the root once", () => {
  const ctx = ctxOf(mapWith({ x: 50, y: 60, raw: BIG }));
  const p = planErase(ctx, 0, [{ x: 52, y: 62 }, { x: 53, y: 63 }, { x: 50, y: 60 }]);
  expect(p.changes).toEqual([{ x: 50, y: 60, raw: hex(NONE_RAW) }]);
});

test("replace-all never leaves a partial footprint: larger replacements that do not fit are skipped", () => {
  const ctx = ctxOf(mapWith({ x: 100, y: 100, raw: ONE }, { x: 102, y: 100, raw: ONE }, { x: 120, y: 100, raw: ONE }));
  const [p] = planReplaceAll(ctx, 0, ONE, BIG, "exact");
  // (100,100) cannot grow into its neighbour at (102,100); once skipped, the neighbour and the isolated one both fit
  expect(p!.counts.replaced).toBe(2);
  expect(p!.skipped).toEqual([{ x: 100, y: 100, reason: "overlaps another item" }]);
  replays(ctx, p!);
});

test("remove-where covers both layers with one plan each", () => {
  const ctx = ctxOf(mapWith({ x: 100, y: 100, raw: ONE }, { layer: 1, x: 100, y: 100, raw: ONE }, { x: 120, y: 100, raw: BIG }));
  const plans = planRemoveWhere(ctx, "both", (raw) => raw === ONE);
  expect(plans.map((p) => p.layer)).toEqual([0, 1]);
  expect(plans.map((p) => p.counts.erased)).toEqual([1, 1]);
});

test("planners never mutate the map they are given", () => {
  const m = mapWith({ x: 100, y: 100, raw: ONE });
  const before = m.items[0].raw.slice();
  planPlace(ctxOf(m), 0, [{ x: 10, y: 10 }], ONE);
  planRemoveWhere(ctxOf(m), "both", () => true);
  expect(m.items[0].raw).toEqual(before);
});

test("WEED_IDS are field-item weeds", () => {
  const fi = (items as unknown as { fieldItems: Record<string, { name: string }> }).fieldItems;
  expect(WEED_IDS.length).toBeGreaterThan(5);
  for (const id of WEED_IDS) expect(fi[id]!.name).toContain("Weed");
});
