import { u32 } from "../util/bytes";

function scramble(value: number): number {
  const v = (Math.imul(value, 0x16a88000) | (Math.imul(value, 0xcc9e2d51) >>> 17)) >>> 0;
  return Math.imul(v, 0x1b873593) >>> 0;
}

function advance(checksum: number, value: number): number {
  checksum = (checksum ^ scramble(value)) >>> 0;
  checksum = ((checksum >>> 19) | (checksum << 13)) >>> 0;
  return (Math.imul(checksum, 5) + 0xe6546b64) >>> 0;
}

function finalize(checksum: number, length: number): number {
  checksum = (checksum ^ length) >>> 0;
  checksum = (checksum ^ (checksum >>> 16)) >>> 0;
  checksum = Math.imul(checksum, 0x85ebca6b) >>> 0;
  checksum = (checksum ^ (checksum >>> 13)) >>> 0;
  checksum = Math.imul(checksum, 0xc2b2ae35) >>> 0;
  return (checksum ^ (checksum >>> 16)) >>> 0;
}

/** Port of NHSE.Core Murmur3.Hash (input length must be a multiple of 4). */
export function murmur3(data: Uint8Array, seed = 0): number {
  if (data.length % 4 !== 0) throw new Error("murmur3 input length must be a multiple of 4");
  let checksum = seed >>> 0;
  for (let i = 0; i < data.length; i += 4) checksum = advance(checksum, u32(data, i));
  return finalize(checksum, data.length);
}
