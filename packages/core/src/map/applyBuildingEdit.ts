import { BUILDING_COUNT, type BuildingInfo } from "./building";
import { isMultiInstanceType, isKnownBuildingType, mayOverlapPlaza, skipsGroundRule } from "./buildingTypes";
import { isNone } from "./footprint";
import { BUILDING_ITEM_TILES, itemToWorld, PLAZA_ITEM_TILES } from "./geometry";
import { groundAt } from "./ground";
import { groundReason, type PlaceCtx } from "./placement";

export type BuildingEditOp = {
  op: "buildingEdit";
  label: string;
  changes: { slot: number; building: BuildingInfo }[];
  plaza?: { x: number; z: number };
};

export type BuildingPlan = { buildings: BuildingInfo[]; plaza: { x: number; z: number } };

const EMPTY: BuildingInfo = { type: 0, x: 0, y: 0, angle: 0, bit: 0, subType: 0, typeArg: 0, uniqueId: 0 };

function int(name: string, v: number, lo: number, hi: number): void {
  if (!Number.isInteger(v) || v < lo || v > hi) throw new RangeError(`${name} must be an integer ${lo}-${hi}`);
}

function same(a: BuildingInfo, b: BuildingInfo): boolean {
  return a.type === b.type && a.x === b.x && a.y === b.y && a.angle === b.angle && a.bit === b.bit && a.subType === b.subType && a.typeArg === b.typeArg && a.uniqueId === b.uniqueId;
}

type Rect = { x: number; y: number; w: number; h: number };
const hit = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const rectOf = (b: BuildingInfo): Rect => ({ x: b.x, y: b.y, w: BUILDING_ITEM_TILES, h: BUILDING_ITEM_TILES });

/** Final state of the op; throws RangeError (reason) if any changed entry breaks a rule. Never mutates `ctx`. */
export function planBuildingEdit(ctx: PlaceCtx, op: BuildingEditOp): BuildingPlan {
  const { map } = ctx;
  const cur = map.buildings;
  const seen = new Set<number>();
  for (const c of op.changes) {
    if (!Number.isInteger(c.slot) || c.slot < 0 || c.slot >= BUILDING_COUNT) throw new RangeError("slot must be 0-45");
    if (seen.has(c.slot)) throw new RangeError(`slot ${c.slot} appears twice`);
    seen.add(c.slot);
    const b = c.building;
    int("type", b.type, 0, 65535);
    int("x", b.x, 0, 65535);
    int("y", b.y, 0, 65535);
    int("angle", b.angle, 0, 255);
    int("bit", b.bit, -128, 127);
    int("subType", b.subType, 0, 65535);
    int("typeArg", b.typeArg, 0, 255);
    int("uniqueId", b.uniqueId, 0, 65535);
  }
  if (op.plaza) {
    int("plaza x", op.plaza.x, 0, 0xffffffff);
    int("plaza z", op.plaza.z, 0, 0xffffffff);
  }

  const buildings = Array.from({ length: BUILDING_COUNT }, (_, i) => ({ ...(cur[i] ?? EMPTY) }));
  const before = buildings.map((b) => ({ ...b }));
  for (const c of op.changes) buildings[c.slot] = c.building.type === 0 ? { ...EMPTY } : { ...c.building };
  const plaza = op.plaza ? { x: op.plaza.x, z: op.plaza.z } : { ...map.plaza };
  const plazaMoved = plaza.x !== map.plaza.x || plaza.z !== map.plaza.z;

  const slots = op.changes.map((c) => c.slot).sort((a, b) => a - b).filter((s) => !same(buildings[s]!, before[s]!) && buildings[s]!.type !== 0);

  // Fields: only the fields the op changes are checked, so a save that already breaks a rule does not block unrelated edits.
  for (const s of slots) {
    const b = buildings[s]!, o = before[s]!, added = o.type === 0;
    if ((added || b.type !== o.type) && !isKnownBuildingType(b.type)) throw new RangeError(`unknown building type ${b.type}`);
    if ((added || b.angle !== o.angle) && b.angle > 3) throw new RangeError("angle must be 0-3");
    if ((added || b.uniqueId !== o.uniqueId) && b.uniqueId !== 0) {
      const other = buildings.findIndex((x, i) => i !== s && x.type !== 0 && x.uniqueId === b.uniqueId);
      if (other >= 0) throw new RangeError(`uniqueId ${b.uniqueId} is already used by slot ${other}`);
    }
    if ((added || b.type !== o.type) && !isMultiInstanceType(b.type)) {
      const other = buildings.findIndex((x, i) => i !== s && x.type === b.type);
      if (other >= 0) throw new RangeError(`type ${b.type} is already used by slot ${other}`);
    }
  }

  // Geometry: only for entries whose footprint (position or kind) changed.
  const origin = itemToWorld(map.items[0].width / 32, 0, 0);
  const area = { w: map.items[0].width, h: map.items[0].height };
  const geo = slots.filter((s) => before[s]!.type === 0 || before[s]!.type !== buildings[s]!.type || before[s]!.x !== buildings[s]!.x || before[s]!.y !== buildings[s]!.y);
  type Target = { name: string; r: Rect; ground: boolean };
  const targets: Target[] = geo.map((s) => ({ name: `building in slot ${s}`, r: rectOf(buildings[s]!), ground: !skipsGroundRule(buildings[s]!.type) }));
  if (plazaMoved) targets.push({ name: "the plaza", r: { x: plaza.x, y: plaza.z, w: PLAZA_ITEM_TILES.w, h: PLAZA_ITEM_TILES.h }, ground: true });
  const inItem = (t: Target) => ({ x: t.r.x - origin.x, y: t.r.y - origin.y });

  for (const t of targets) {
    const p = inItem(t);
    if (p.x < 0 || p.y < 0 || p.x + t.r.w > area.w || p.y + t.r.h > area.h) throw new RangeError(`${t.name} would be outside the item area`);
  }
  for (const t of targets) {
    if (!t.ground) continue;
    const p = inItem(t);
    for (let x = 0; x < t.r.w; x++)
      for (let y = 0; y < t.r.h; y++) {
        const g = groundAt(ctx, p.x + x, p.y + y);
        if (g !== "land") throw new RangeError(`${t.name} would stand on ${groundReason(g)}`);
      }
  }
  const plazaRect: Rect = { x: plaza.x, y: plaza.z, w: PLAZA_ITEM_TILES.w, h: PLAZA_ITEM_TILES.h };
  for (const s of geo) {
    const r = rectOf(buildings[s]!);
    for (let o = 0; o < BUILDING_COUNT; o++)
      if (o !== s && buildings[o]!.type !== 0 && hit(r, rectOf(buildings[o]!))) throw new RangeError(`building in slot ${s} overlaps building in slot ${o}`);
  }
  if (plazaMoved)
    for (let o = 0; o < BUILDING_COUNT; o++)
      if (buildings[o]!.type !== 0 && !mayOverlapPlaza(buildings[o]!.type) && hit(plazaRect, rectOf(buildings[o]!))) throw new RangeError(`the plaza overlaps building in slot ${o}`);
  for (const s of geo)
    if (!mayOverlapPlaza(buildings[s]!.type) && hit(rectOf(buildings[s]!), plazaRect)) throw new RangeError(`building in slot ${s} overlaps the plaza`);
  for (const t of targets) {
    const p = inItem(t);
    let n = 0;
    for (const l of map.items)
      for (let x = 0; x < t.r.w; x++) for (let y = 0; y < t.r.h; y++) if (!isNone(l.raw[l.height * (p.x + x) + (p.y + y)]!)) n++;
    if (n) throw new RangeError(`${t.name} overlaps ${n} item${n === 1 ? "" : "s"}`);
  }
  return { buildings, plaza };
}
