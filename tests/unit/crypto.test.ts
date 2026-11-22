import { expect, test } from "bun:test";
import v from "../fixtures/vectors.json";
import { murmur3 } from "../../packages/core/src/crypto/murmur3";
import { EncryptedInt32 } from "../../packages/core/src/crypto/encryptedInt32";
import { decrypt, encrypt } from "../../packages/core/src/crypto/encryption";
import { u32 } from "../../packages/core/src/util/bytes";

const hex = (s: string) => Uint8Array.from(Buffer.from(s, "hex"));
const toHex = (b: Uint8Array) => Buffer.from(b).toString("hex");

test("murmur3 matches upstream", () => {
  for (const c of v.murmur3) expect(murmur3(hex(c.hex))).toBe(c.hash);
});

test("EncryptedInt32 round-trips upstream encodings", () => {
  for (const c of v.encInt) {
    const buf = new Uint8Array(8);
    EncryptedInt32.write({ value: c.value, shift: c.shift, adjust: c.adjust, checksum: 0 }, buf, 0);
    expect(u32(buf, 0)).toBe(c.encrypted);
    expect(buf[7]).toBe(c.checksum);
    const back = EncryptedInt32.readVerify(buf, 0);
    expect(back.value).toBe(c.value);
    expect(back.shift).toBe(c.shift);
    expect(back.adjust).toBe(c.adjust);
  }
});

test("readVerify throws on bad checksum", () => {
  const b = new Uint8Array(8);
  expect(() => EncryptedInt32.readVerify(b, 0)).toThrow();
});

test("encrypt matches upstream bytes and decrypt inverts it", async () => {
  for (const c of v.encryption) {
    const out = await encrypt(hex(c.dataHex), c.seed, hex(c.versionHeaderHex));
    expect(toHex(out.header)).toBe(c.outHeaderHex);
    expect(toHex(out.data)).toBe(c.outDataHex);
    expect(toHex(await decrypt(out.header, out.data))).toBe(c.dataHex);
  }
});
