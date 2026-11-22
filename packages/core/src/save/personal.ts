import { EncryptedInt32, type EncInt } from "../crypto/encryptedInt32";
import { getUtf16, setU32, setUtf16, u32, u16, setU16 } from "../util/bytes";
import { readDateMD, writeDateMD, type DateMD } from "../structures/date";
import { Item } from "../structures/item";
import { EncryptedFilePair } from "./encryptedFilePair";
import type { HorizonSave } from "./horizonSave";

export type ItemArea = "pocket" | "bag" | "itemChest";

/** The per-player `personal` file (port of NHSE.Core Personal; offsets come from the revision table). */
export class Personal extends EncryptedFilePair {
  get offsets(): Record<string, number> {
    return this.revision.personalOffsets;
  }
  private off(name: string): number {
    const v = this.offsets[name];
    if (v === undefined) throw new Error(`Offset ${name} is not defined for revision ${this.revision.label}`);
    return v;
  }

  get townId(): number { return u32(this.data, this.off("PersonalId")); }
  set townId(v: number) { setU32(this.data, this.off("PersonalId"), v); }
  get townName(): string { return getUtf16(this.data, this.off("PersonalId") + 0x04, 10); }
  set townName(v: string) { setUtf16(this.data, this.off("PersonalId") + 0x04, v, 10); }
  get playerId(): number { return u32(this.data, this.off("PersonalId") + 0x1c); }
  set playerId(v: number) { setU32(this.data, this.off("PersonalId") + 0x1c, v); }
  get playerName(): string { return getUtf16(this.data, this.off("PersonalId") + 0x20, 10); }
  set playerName(v: string) { setUtf16(this.data, this.off("PersonalId") + 0x20, v, 10); }

  /** Copies of the 24-byte identity blobs (id + name) used to rename across files. */
  townIdentity(): Uint8Array { const o = this.off("PersonalId"); return this.data.slice(o, o + 24); }
  playerIdentity(): Uint8Array { const o = this.off("PersonalId") + 0x1c; return this.data.slice(o, o + 24); }

  private enc(name: string): EncInt { return EncryptedInt32.readVerify(this.data, this.off(name)); }
  private setEnc(name: string, v: EncInt): void { EncryptedInt32.write(v, this.data, this.off(name)); }

  get wallet(): EncInt { return this.enc("Wallet"); }
  set wallet(v: EncInt) { this.setEnc("Wallet", v); }
  get bank(): EncInt { return this.enc("Bank"); }
  set bank(v: EncInt) { this.setEnc("Bank", v); }
  get nookMiles(): EncInt { return this.enc("NowPoint"); }
  set nookMiles(v: EncInt) { this.setEnc("NowPoint", v); }
  get totalNookMiles(): EncInt { return this.enc("TotalPoint"); }
  set totalNookMiles(v: EncInt) { this.setEnc("TotalPoint", v); }

  /** Hotel tickets (3.0+); null when this revision has none or the struct is uninitialized. */
  private get hotelOffset(): number | null {
    const o = this.offsets["Offset30s_064c1881"];
    if (o === undefined) return null;
    for (let i = 0; i < 8; i++) if (this.data[o + i] !== 0) return o;
    return null;
  }
  get hotelTickets(): EncInt | null {
    const o = this.hotelOffset;
    return o === null ? null : EncryptedInt32.readVerify(this.data, o);
  }
  set hotelTickets(v: EncInt | null) {
    const o = this.hotelOffset;
    if (o === null || v === null) throw new Error("Hotel tickets are not available in this save.");
    EncryptedInt32.write(v, this.data, o);
  }

  // NHSE naming: "pocket" = slots 1-20 (Pockets2), "bag" = slots 21-40 (Pockets1).
  private areaBase(area: ItemArea): number {
    return area === "pocket" ? this.off("Pockets2") : area === "bag" ? this.off("Pockets1") : this.off("ItemChest");
  }
  /** Number of item slots that physically exist in the file for the area. */
  slotCount(area: ItemArea): number {
    return area === "pocket" ? this.off("Pockets2Count") : area === "bag" ? this.off("Pockets1Count") : this.off("ItemChestCount");
  }
  /** Unlocked-slot counter stored right after the item array. */
  private countOffset(area: ItemArea): number { return this.areaBase(area) + this.slotCount(area) * Item.SIZE; }
  get pocketCount(): number { return u32(this.data, this.countOffset("pocket")); }
  set pocketCount(v: number) { setU32(this.data, this.countOffset("pocket"), v); }
  get bagCount(): number { return u32(this.data, this.countOffset("bag")); }
  set bagCount(v: number) { setU32(this.data, this.countOffset("bag"), v); }
  get itemChestCount(): number { return u32(this.data, this.countOffset("itemChest")); }
  set itemChestCount(v: number) { setU32(this.data, this.countOffset("itemChest"), v); }

  getItems(area: ItemArea): Item[] {
    return Item.readArray(this.data, this.areaBase(area), this.slotCount(area));
  }
  setItem(area: ItemArea, slot: number, item: Item): void {
    if (slot < 0 || slot >= this.slotCount(area)) throw new RangeError(`${area} slot ${slot} is out of range`);
    item.write(this.data, this.areaBase(area) + slot * Item.SIZE);
  }

  get birthday(): DateMD { return readDateMD(this.data, this.off("Birthday")); }
  set birthday(v: DateMD) { writeDateMD(this.data, this.off("Birthday"), v); }
  get profileBirthday(): DateMD { return readDateMD(this.data, this.off("ProfileBirthday")); }
  set profileBirthday(v: DateMD) { writeDateMD(this.data, this.off("ProfileBirthday"), v); }
  get profileFruit(): number { return u16(this.data, this.off("ProfileFruit")); }
  set profileFruit(v: number) { setU16(this.data, this.off("ProfileFruit"), v); }
}

/** Renames a player and propagates the identity change through every file, as upstream's editor does. */
export function renamePlayer(save: HorizonSave, playerIndex: number, name: string): void {
  const pe = save.players[playerIndex]!.personal;
  const orig = pe.playerIdentity();
  pe.playerName = name;
  save.changeIdentity(orig, pe.playerIdentity());
}

/** Renames the town (identity is read from the given player, default the first) everywhere. */
export function renameTown(save: HorizonSave, name: string, playerIndex = 0): void {
  const pe = save.players[playerIndex]!.personal;
  const orig = pe.townIdentity();
  pe.townName = name;
  save.changeIdentity(orig, pe.townIdentity());
}
