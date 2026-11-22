import { u16, u32, setU16, setU32 } from "../util/bytes";

const ENCRYPTION_CONSTANT = 0x80e32b11;
const SHIFT_BASE = 3;

/** Decoded EncryptedInt32: `value` is plaintext; shift/adjust/checksum are the stored parameters. */
export type EncInt = { value: number; adjust: number; shift: number; checksum: number };

const rotr = (v: number, n: number) => ((v >>> (n & 31)) | (v << (32 - (n & 31)))) >>> 0;
const rotl = (v: number, n: number) => ((v << (n & 31)) | (v >>> (32 - (n & 31)))) >>> 0;

function decryptValue(encrypted: number, shift: number, adjust: number): number {
  return (rotr(encrypted, shift + SHIFT_BASE) + ENCRYPTION_CONSTANT - adjust) >>> 0;
}

function encryptValue(value: number, shift: number, adjust: number): number {
  return rotl((value + adjust - ENCRYPTION_CONSTANT) >>> 0, shift + SHIFT_BASE);
}

export const EncryptedInt32 = {
  /** Sum of every byte of the encrypted value, minus 0x2D. */
  calcChecksum(enc: number): number {
    return ((enc + (enc >>> 16) + (enc >>> 24) + (enc >>> 8)) - 0x2d) & 0xff;
  },

  read(d: Uint8Array, o: number): EncInt {
    const enc = u32(d, o);
    const adjust = u16(d, o + 4);
    const shift = d[o + 6]!;
    return { value: decryptValue(enc, shift, adjust), adjust, shift, checksum: d[o + 7]! };
  },

  readVerify(d: Uint8Array, o: number): EncInt {
    const v = EncryptedInt32.read(d, o);
    if (v.checksum !== EncryptedInt32.calcChecksum(u32(d, o)))
      throw new Error(`Failed to verify the EncryptedInt32 at offset 0x${o.toString(16).padStart(8, "0")}.`);
    return v;
  },

  /** Re-encrypts `value` with its stored shift/adjust and writes a fresh checksum. */
  write(v: EncInt, d: Uint8Array, o: number): void {
    const enc = encryptValue(v.value >>> 0, v.shift, v.adjust);
    setU32(d, o, enc);
    setU16(d, o + 4, v.adjust);
    d[o + 6] = v.shift;
    d[o + 7] = EncryptedInt32.calcChecksum(enc);
  },
};
