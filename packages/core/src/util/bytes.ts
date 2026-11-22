// Little-endian byte helpers over Uint8Array (port of the BinaryPrimitives / StringUtil / ArrayUtil bits NHSE.Core uses).

export function u16(d: Uint8Array, o: number): number {
  return (d[o]! | (d[o + 1]! << 8)) >>> 0;
}

export function u32(d: Uint8Array, o: number): number {
  return (d[o]! | (d[o + 1]! << 8) | (d[o + 2]! << 16) | (d[o + 3]! << 24)) >>> 0;
}

export function setU16(d: Uint8Array, o: number, v: number): void {
  d[o] = v & 0xff;
  d[o + 1] = (v >>> 8) & 0xff;
}

export function setU32(d: Uint8Array, o: number, v: number): void {
  d[o] = v & 0xff;
  d[o + 1] = (v >>> 8) & 0xff;
  d[o + 2] = (v >>> 16) & 0xff;
  d[o + 3] = (v >>> 24) & 0xff;
}

/** Reads up to `maxChars` UTF-16LE code units and trims from the first NUL (StringUtil.GetString). */
export function getUtf16(d: Uint8Array, o: number, maxChars: number): string {
  let s = "";
  for (let i = 0; i < maxChars; i++) {
    const c = u16(d, o + i * 2);
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

/** Writes exactly `maxChars` UTF-16LE code units: truncates or NUL-pads (StringUtil.GetBytes). */
export function setUtf16(d: Uint8Array, o: number, s: string, maxChars: number): void {
  for (let i = 0; i < maxChars; i++) setU16(d, o + i * 2, i < s.length ? s.charCodeAt(i) : 0);
}

function indexOf(hay: Uint8Array, needle: Uint8Array, from: number): number {
  const n = needle.length;
  outer: for (let i = from; i <= hay.length - n; i++) {
    for (let j = 0; j < n; j++) if (hay[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

/** In-place, non-overlapping replacement. Returns count, or -1 if lengths differ (ArrayUtil.ReplaceOccurrences). */
export function replaceOccurrences(d: Uint8Array, pattern: Uint8Array, replacement: Uint8Array): number {
  if (pattern.length !== replacement.length) return -1;
  if (pattern.length === 0) return 0;
  if (pattern.every((b, i) => b === replacement[i])) return 0;
  let count = 0;
  let ofs = 0;
  for (;;) {
    const idx = indexOf(d, pattern, ofs);
    if (idx === -1) return count;
    d.set(replacement, idx);
    ofs = idx + replacement.length;
    count++;
  }
}
