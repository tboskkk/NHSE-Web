import { BUILDING_COUNT, BUILDING_ITEM_TILES, itemToWorld, PLAZA_ITEM_TILES, type BuildingEditOp, type BuildingInfo, type MapData } from "@nhse/core";

export type Target = { kind: "building"; slot: number } | { kind: "plaza" };
export type Rect = { x: number; y: number; w: number; h: number };

const originOf = (acreW: number) => itemToWorld(acreW, 0, 0);

/** Building or plaza under an item-layer tile; buildings win over the plaza and empty slots are ignored. */
export function hitTarget(map: MapData, acreW: number, tile: { x: number; y: number }): Target | null {
  const o = originOf(acreW);
  const wx = tile.x + o.x, wy = tile.y + o.y;
  for (let slot = 0; slot < map.buildings.length; slot++) {
    const b = map.buildings[slot]!;
    if (b.type !== 0 && wx >= b.x && wx < b.x + BUILDING_ITEM_TILES && wy >= b.y && wy < b.y + BUILDING_ITEM_TILES) return { kind: "building", slot };
  }
  const p = map.plaza;
  if (wx >= p.x && wx < p.x + PLAZA_ITEM_TILES.w && wy >= p.z && wy < p.z + PLAZA_ITEM_TILES.h) return { kind: "plaza" };
  return null;
}

/** Footprint in item-layer coordinates (may lie outside the layer, for ghosts). */
export function targetRect(map: MapData, acreW: number, t: Target): Rect {
  const o = originOf(acreW);
  if (t.kind === "plaza") return { x: map.plaza.x - o.x, y: map.plaza.z - o.y, w: PLAZA_ITEM_TILES.w, h: PLAZA_ITEM_TILES.h };
  const b = map.buildings[t.slot]!;
  return { x: b.x - o.x, y: b.y - o.y, w: BUILDING_ITEM_TILES, h: BUILDING_ITEM_TILES };
}

const op = (label: string, changes: BuildingEditOp["changes"], plaza?: BuildingEditOp["plaza"]): BuildingEditOp => ({ op: "buildingEdit", label, changes, ...(plaza ? { plaza } : {}) });

/** Moves a target so its top-left lands on item tile `to`. */
export function moveOp(map: MapData, acreW: number, t: Target, to: { x: number; y: number }): BuildingEditOp {
  const w = itemToWorld(acreW, to.x, to.y);
  if (t.kind === "plaza") return op("Move plaza", [], { x: w.x, z: w.y });
  return op("Move building", [{ slot: t.slot, building: { ...map.buildings[t.slot]!, x: w.x, y: w.y } }]);
}

export function fieldOp(map: MapData, slot: number, patch: Partial<BuildingInfo>): BuildingEditOp {
  return op("Edit building", [{ slot, building: { ...map.buildings[slot]!, ...patch } }]);
}

export function deleteOp(map: MapData, slot: number): BuildingEditOp {
  return op("Delete building", [{ slot, building: { ...map.buildings[slot]!, type: 0 } }]);
}

export const freeSlots = (map: MapData): number => map.buildings.filter((b) => b.type === 0).length;

/** First empty slot, smallest unused uniqueId >= 1; null when every slot is in use. `at` is the item tile of the top-left. */
export function addOp(map: MapData, acreW: number, type: number, at: { x: number; y: number }): BuildingEditOp | null {
  const slot = map.buildings.findIndex((b) => b.type === 0);
  if (slot < 0 || slot >= BUILDING_COUNT) return null;
  const used = new Set(map.buildings.filter((b) => b.type !== 0).map((b) => b.uniqueId));
  let id = 1;
  while (used.has(id)) id++;
  const w = itemToWorld(acreW, at.x, at.y);
  return op("Add building", [{ slot, building: { type, x: w.x, y: w.y, angle: 0, bit: 0, subType: 0, typeArg: 0, uniqueId: id } }]);
}

/** Keeps a selection only while it still points at something: the plaza, or a slot that holds a building. */
export function reconcileSelection(map: MapData, sel: Target | null): Target | null {
  if (!sel || sel.kind === "plaza") return sel;
  return (map.buildings[sel.slot]?.type ?? 0) !== 0 ? sel : null;
}

/** Number from an input's text, or null for blank/non-numeric (Number("") is 0, which must not become an edit). */
export function parseField(text: string): number | null {
  if (text.trim() === "") return null;
  const n = Number(text);
  return Number.isNaN(n) ? null : n;
}
