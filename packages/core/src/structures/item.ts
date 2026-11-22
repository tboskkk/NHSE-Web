import { flowerGeneNames } from "../items/itemInfo";


/** An 8-byte inventory/field item (port of NHSE.Core Item). `raw` is the little-endian u64 as stored. */
export class Item {
  static readonly SIZE = 8;
  static readonly NONE = 0xfffe;
  static readonly EXTENSION = 0xfffd;
  static readonly MESSAGE_BOTTLE = 0x16a1;
  static readonly MESSAGE_BOTTLE_EGG = 0x3100;
  static readonly LLOYD = 63005;

  constructor(public raw: bigint = BigInt(Item.NONE)) {}

  static read(d: Uint8Array, o: number): Item {
    let v = 0n;
    for (let i = 7; i >= 0; i--) v = (v << 8n) | BigInt(d[o + i]!);
    return new Item(v);
  }

  write(d: Uint8Array, o: number): void {
    let v = this.raw;
    for (let i = 0; i < 8; i++) {
      d[o + i] = Number(v & 0xffn);
      v >>= 8n;
    }
  }

  static readArray(d: Uint8Array, o: number, count: number): Item[] {
    return Array.from({ length: count }, (_, i) => Item.read(d, o + i * Item.SIZE));
  }

  private get(shift: number, bits: number): number {
    return Number((this.raw >> BigInt(shift)) & ((1n << BigInt(bits)) - 1n));
  }
  private set(shift: number, bits: number, value: number): void {
    const mask = ((1n << BigInt(bits)) - 1n) << BigInt(shift);
    this.raw = (this.raw & ~mask) | ((BigInt(value) << BigInt(shift)) & mask);
  }

  get itemId(): number { return this.get(0, 16); }
  set itemId(v: number) { this.set(0, 16, v); }
  get systemParam(): number { return this.get(16, 8); }
  set systemParam(v: number) { this.set(16, 8, v); }
  get additionalParam(): number { return this.get(24, 8); }
  set additionalParam(v: number) { this.set(24, 8, v); }
  /** Signed 32-bit, like upstream's `int FreeParam`. */
  get freeParam(): number { return Number(BigInt.asIntN(32, this.raw >> 32n)); }
  set freeParam(v: number) { this.set(32, 32, v >>> 0); }

  // Stackable items
  get count(): number { return this.get(32, 16); }
  set count(v: number) { this.set(32, 16, v); }
  get useCount(): number { return this.get(48, 16); }
  set useCount(v: number) { this.set(48, 16, v); }

  // Flowers: the low byte of freeParam is the gene bitfield
  get genes(): number { return this.get(32, 8); }
  set genes(v: number) { this.set(32, 8, v); }

  // Extension tiles (multi-tile furniture)
  get extensionItemId(): number { return this.get(32, 16); }
  set extensionItemId(v: number) { this.set(32, 16, v); }

  get isNone(): boolean { return this.itemId === Item.NONE; }
  get isExtension(): boolean { return this.itemId === Item.EXTENSION; }
  get displayItemId(): number { return this.isExtension ? this.extensionItemId : this.itemId; }

  // systemParam flags
  get rotation(): number { return this.systemParam & 3; }
  set rotation(v: number) { this.systemParam = (this.systemParam & ~3) | (v & 3); }
  get isBuried(): boolean { return (this.systemParam & 0x04) !== 0; }
  set isBuried(v: boolean) { this.systemParam = (this.systemParam & ~0x04) | (v ? 0x04 : 0); }
  get isDropped(): boolean { return (this.systemParam & 0x20) !== 0; }
  set isDropped(v: boolean) { this.systemParam = (this.systemParam & ~0x20) | (v ? 0x20 : 0); }

  // additionalParam: wrapping. Low 2 bits = type (0 none, 1 paper, 2 present, 3 delivery), bits 2-5 = paper colour.
  get isWrapped(): boolean {
    if (this.additionalParam === 0) return false;
    const d = this.displayItemId;
    return d !== Item.MESSAGE_BOTTLE && d !== Item.MESSAGE_BOTTLE_EGG;
  }
  get wrappingPaper(): number { return (this.additionalParam >> 2) & 0xf; }
  set wrappingPaper(v: number) { this.additionalParam = (this.additionalParam & 3) | ((v & 0xf) << 2); }
  /** 0 none, 1 paper, 2 present, 3 delivery, 4 festive (delivery + black paper). */
  get wrappingType(): number {
    const v = this.additionalParam & 3;
    return v === 3 && this.wrappingPaper === 15 ? 4 : v;
  }
  set wrappingType(v: number) {
    if (v === 4) {
      v = 3;
      this.wrappingPaper = 15;
    }
    this.additionalParam = (this.additionalParam & ~3) | (v & 3);
  }
  get wrappingShowItem(): boolean { return (this.additionalParam & 0x40) !== 0; }
  set wrappingShowItem(v: boolean) { this.additionalParam = (this.additionalParam & ~0x40) | (v ? 0x40 : 0); }

  // Customizable items (packed in freeParam)
  get bodyType(): number { return this.freeParam & 7; }
  set bodyType(v: number) { this.freeParam = (this.freeParam & ~7) | (v & 7); }
  get patternSource(): number { return (this.freeParam >> 3) & 3; }
  set patternSource(v: number) { this.freeParam = (this.freeParam & ~0x18) | ((v & 3) << 3); }
  get patternChoice(): number { return this.freeParam >> 5; }
  set patternChoice(v: number) { this.freeParam = (this.freeParam & 0x1f) | ((v & 0x7ff) << 5); }

  clone(): Item { return new Item(this.raw); }
}

/** Renders gene flags like .NET's [Flags] enum ToString, e.g. 0x30 -> "w1, w2". */
export function formatFlowerGenes(genes: number): string {
  const named = Object.entries(flowerGeneNames).sort((a, b) => a[1] - b[1]);
  const parts = named.filter(([, bit]) => (genes & bit) !== 0).map(([n]) => n);
  const covered = named.reduce((acc, [, bit]) => acc | bit, 0);
  return (genes & ~covered) !== 0 ? String(genes) : parts.join(", ");
}

