import { u32, setU32 } from "../util/bytes";
import { aesCtr } from "./aesCtr";
import { XorShift128 } from "./xorshift128";

const BLOCK = 16;

function getParam(data: Uint32Array, index: number, result: Uint8Array): void {
  const rand = new XorShift128(data[data[index]! & 0x7f]!);
  const prms = data[data[index + 1]! & 0x7f]! & 0x7f;
  const rolls = (prms & 0xf) + 1;
  for (let i = 0; i < rolls; i++) rand.next64();
  for (let i = 0; i < result.length; i++) result[i] = rand.next() >>> 24;
}

function readParams(header: Uint8Array): Uint32Array {
  const out = new Uint32Array(128);
  for (let i = 0; i < 128; i++) out[i] = u32(header, 0x100 + i * 4);
  return out;
}

function keyAndCounter(params: Uint32Array): { key: Uint8Array; counter: Uint8Array } {
  const key = new Uint8Array(BLOCK);
  const counter = new Uint8Array(BLOCK);
  getParam(params, 0, key);
  getParam(params, 2, counter);
  return { key, counter };
}

/** Decrypts `enc` using the header (>= 0x300 bytes). Returns a new buffer. */
export async function decrypt(header: Uint8Array, enc: Uint8Array): Promise<Uint8Array> {
  const { key, counter } = keyAndCounter(readParams(header));
  return aesCtr(enc, key, counter);
}

/** Encrypts `data` with a header generated from `seed`; the first 0x100 bytes come from `versionData`. */
export async function encrypt(
  data: Uint8Array,
  seed: number,
  versionData: Uint8Array,
): Promise<{ data: Uint8Array; header: Uint8Array }> {
  const rand = new XorShift128(seed);
  const params = new Uint32Array(128);
  for (let i = 0; i < 128; i++) params[i] = rand.next();

  const header = new Uint8Array(0x300);
  header.set(versionData.subarray(0, 0x100));
  for (let i = 0; i < 128; i++) setU32(header, 0x100 + i * 4, params[i]!);

  const { key, counter } = keyAndCounter(params);
  return { data: await aesCtr(data, key, counter), header };
}
