import type { HorizonSave } from "../save/horizonSave";
import { renamePlayer, renameTown, type ItemArea, type Personal } from "../save/personal";
import { Item } from "../structures/item";
import type { GameStrings } from "../strings/gameStrings";

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

export function applyOp(save: HorizonSave, op: EditOp): void {
  switch (op.op) {
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
      for (const o of op.ops) applyOp(save, o);
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
    case "batch":
      return op.label;
  }
}
