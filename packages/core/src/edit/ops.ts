import type { HorizonSave } from "../save/horizonSave";
import { renamePlayer, renameTown, type ItemArea, type Personal } from "../save/personal";
import { Item } from "../structures/item";
import type { GameStrings } from "../strings/gameStrings";
import { type MapEditOp, planMapEdit, writeTiles } from "../map/applyMapEdit";
import { type BuildingEditOp, planBuildingEdit, writeBuildingEdit } from "../map/applyBuildingEdit";
import { readMap } from "../map/mapData";

/** Extra data some ops need that the save does not carry. */
export type OpEnv = { acreTiles?: Uint8Array };

export type SlotRef = { area: ItemArea; slot: number };
export type MoneyField = "wallet" | "bank" | "nookMiles" | "totalNookMiles" | "hotelTickets";
export type CountField = "pocketCount" | "bagCount" | "itemChestCount";

export type EditOp =
  | { op: MoneyField; player: number; value: number }
  | { op: CountField; player: number; value: number }
  | { op: "playerName"; player: number; value: string }
  | { op: "townName"; value: string }
  | { op: "birthday"; player: number; month: number; day: number } /* writes birthday AND profileBirthday, as upstream MiscPlayerEditor does */
  | { op: "profileFruit"; player: number; value: number }
  | { op: "setItem"; player: number; area: ItemArea; slot: number; raw: string /* 16 hex */ }
  | { op: "moveItem"; player: number; from: SlotRef; to: SlotRef } /* swap */
  | BuildingEditOp /* whole building slots + plaza; see map/applyBuildingEdit.ts */
  | MapEditOp /* tiles of one field item layer; see map/applyMapEdit.ts */
  | { op: "batch"; label: string; ops: EditOp[] }; /* one undo step; describeOp returns label */

const personalOf = (save: HorizonSave, player: number): Personal => {
  const p = save.players[player];
  if (!p) throw new RangeError(`Player ${player} does not exist`);
  return p.personal;
};

const parseRaw = (raw: string): bigint => {
  if (!/^[0-9a-fA-F]{16}$/.test(raw)) throw new Error(`Item raw must be 16 hex digits, got "${raw}"`);
  return BigInt("0x" + raw);
};

const MONEY_LABEL: Record<MoneyField, string> = {
  wallet: "Wallet",
  bank: "Bank",
  nookMiles: "Nook Miles",
  totalNookMiles: "Total Nook Miles",
  hotelTickets: "Hotel tickets",
};
const COUNT_LABEL: Record<CountField, string> = {
  pocketCount: "Pocket slots unlocked",
  bagCount: "Bag slots unlocked",
  itemChestCount: "Storage slots unlocked",
};
const AREA_LABEL: Record<ItemArea, string> = { pocket: "Pocket", bag: "Bag", itemChest: "Storage" };

function readMoney(pe: Personal, f: MoneyField): number {
  if (f === "hotelTickets") {
    const h = pe.hotelTickets;
    if (!h) throw new Error("Hotel tickets are not available in this save.");
    return h.value;
  }
  return pe[f].value;
}

function itemAt(pe: Personal, r: SlotRef): Item {
  const items = pe.getItems(r.area);
  const it = items[r.slot];
  if (!it) throw new RangeError(`${r.area} slot ${r.slot} is out of range`);
  return it;
}

const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const uint = (name: string, v: number, max: number) => {
  if (!Number.isInteger(v) || v < 0 || v > max) throw new RangeError(`${name} must be a whole number from 0 to ${max.toLocaleString("en-US")}, got ${v}`);
};

/** Throws RangeError/Error for an op that would write a wrong or wrapped value; touches nothing. */
export function validateOp(save: HorizonSave, op: EditOp, env: OpEnv = {}): void {
  if (op.op === "batch") {
    for (const o of op.ops) validateOp(save, o, env);
    return;
  }
  if (op.op === "mapEdit") {
    planFor(save, op, env);
    return;
  }
  if (op.op === "buildingEdit") {
    buildingPlanFor(save, op, env);
    return;
  }
  if (op.op !== "townName") personalOf(save, op.player);
  switch (op.op) {
    case "wallet":
    case "bank":
    case "nookMiles":
    case "totalNookMiles":
    case "hotelTickets":
    case "pocketCount":
    case "bagCount":
    case "itemChestCount":
      return uint(op.op, op.value, 0xffffffff);
    case "profileFruit":
      return uint(op.op, op.value, 0xffff);
    case "birthday":
      uint("month", op.month, 12);
      if (op.month < 1) throw new RangeError("month must be 1-12");
      uint("day", op.day, MONTH_DAYS[op.month - 1]!);
      if (op.day < 1) throw new RangeError("day must be at least 1");
      return;
    case "setItem": {
      parseRaw(op.raw);
      const n = personalOf(save, op.player).slotCount(op.area);
      if (!Number.isInteger(op.slot) || op.slot < 0 || op.slot >= n) throw new RangeError(`${op.area} slot ${op.slot} is out of range`);
      return;
    }
    case "moveItem": {
      const pe = personalOf(save, op.player);
      for (const r of [op.from, op.to]) {
        const n = pe.slotCount(r.area);
        if (!Number.isInteger(r.slot) || r.slot < 0 || r.slot >= n) throw new RangeError(`${r.area} slot ${r.slot} is out of range`);
      }
      return;
    }
    case "playerName":
    case "townName":
      return;
  }
}

function planFor(save: HorizonSave, op: MapEditOp, env: OpEnv) {
  if (!env.acreTiles) throw new Error("Map data is not available.");
  const map = readMap(save.main.data, save.revision);
  return { map, tiles: planMapEdit({ map, acreTiles: env.acreTiles }, op) };
}

function buildingPlanFor(save: HorizonSave, op: BuildingEditOp, env: OpEnv) {
  if (!env.acreTiles) throw new Error("Map data is not available.");
  const map = readMap(save.main.data, save.revision);
  const before = { buildings: map.buildings, plaza: map.plaza };
  return { before, after: planBuildingEdit({ map, acreTiles: env.acreTiles }, op) };
}

export function applyOp(save: HorizonSave, op: EditOp, env: OpEnv = {}): void {
  validateOp(save, op, env);
  applyValidated(save, op, env);
}

function applyValidated(save: HorizonSave, op: EditOp, env: OpEnv): void {
  switch (op.op) {
    case "mapEdit": {
      const { map, tiles } = planFor(save, op, env);
      const l = map.items[op.layer];
      writeTiles(save.main.data, save.revision, op.layer, l.height, l.width, tiles, l.raw);
      return;
    }
    case "buildingEdit": {
      const { before, after } = buildingPlanFor(save, op, env);
      writeBuildingEdit(save.main.data, save.revision, before, after);
      return;
    }
    case "wallet":
    case "bank":
    case "nookMiles":
    case "totalNookMiles": {
      const pe = personalOf(save, op.player);
      pe[op.op] = { ...pe[op.op], value: op.value };
      return;
    }
    case "hotelTickets": {
      const pe = personalOf(save, op.player);
      const h = pe.hotelTickets;
      if (!h) throw new Error("Hotel tickets are not available in this save.");
      pe.hotelTickets = { ...h, value: op.value };
      return;
    }
    case "pocketCount":
    case "bagCount":
    case "itemChestCount":
      personalOf(save, op.player)[op.op] = op.value;
      return;
    case "playerName":
      personalOf(save, op.player); // validate index
      renamePlayer(save, op.player, op.value);
      return;
    case "townName":
      renameTown(save, op.value);
      return;
    case "birthday": {
      const pe = personalOf(save, op.player);
      pe.birthday = { month: op.month, day: op.day };
      pe.profileBirthday = { month: op.month, day: op.day };
      return;
    }
    case "profileFruit":
      personalOf(save, op.player).profileFruit = op.value;
      return;
    case "setItem":
      personalOf(save, op.player).setItem(op.area, op.slot, new Item(parseRaw(op.raw)));
      return;
    case "moveItem": {
      const pe = personalOf(save, op.player);
      const a = itemAt(pe, op.from);
      const b = itemAt(pe, op.to);
      pe.setItem(op.from.area, op.from.slot, b);
      pe.setItem(op.to.area, op.to.slot, a);
      return;
    }
    case "batch":
      for (const o of op.ops) applyValidated(save, o, env);
      return;
  }
}

const fmt = (n: number) => n.toLocaleString("en-US");

export function describeOp(save: HorizonSave, strings: GameStrings, op: EditOp): string {
  switch (op.op) {
    case "wallet":
    case "bank":
    case "nookMiles":
    case "totalNookMiles":
    case "hotelTickets":
      return `${MONEY_LABEL[op.op]}: ${fmt(readMoney(personalOf(save, op.player), op.op))} → ${fmt(op.value)}`;
    case "pocketCount":
    case "bagCount":
    case "itemChestCount":
      return `${COUNT_LABEL[op.op]}: ${fmt(personalOf(save, op.player)[op.op])} → ${fmt(op.value)}`;
    case "playerName":
      return `Player name: ${personalOf(save, op.player).playerName} → ${op.value}`;
    case "townName":
      return `Town name: ${personalOf(save, 0).townName} → ${op.value}`;
    case "birthday": {
      const b = personalOf(save, op.player).birthday;
      return `Birthday: ${b.month}/${b.day} → ${op.month}/${op.day}`;
    }
    case "profileFruit":
      return `Native fruit: ${personalOf(save, op.player).profileFruit} → ${op.value}`;
    case "setItem": {
      const from = strings.getItemName(itemAt(personalOf(save, op.player), op));
      return `${AREA_LABEL[op.area]} slot ${op.slot + 1}: ${from} → ${strings.getItemName(new Item(parseRaw(op.raw)))}`;
    }
    case "moveItem": {
      const pe = personalOf(save, op.player);
      const a = strings.getItemName(itemAt(pe, op.from));
      const b = strings.getItemName(itemAt(pe, op.to));
      return `Swap ${AREA_LABEL[op.from.area]} slot ${op.from.slot + 1} (${a}) with ${AREA_LABEL[op.to.area]} slot ${op.to.slot + 1} (${b})`;
    }
    case "mapEdit":
    case "buildingEdit":
    case "batch":
      return op.label;
  }
}
