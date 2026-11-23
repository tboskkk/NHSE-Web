/** Test-only builders for Nintendo container formats. Everything is synthetic; no real game bytes. */

/** Little-endian SARC with SFAT/SFNT (hashes are zero: the reader does not use them). */
export function buildSarc(files: Record<string, Uint8Array>): Uint8Array {
  const names = Object.keys(files);
  const nameBytes = names.map((n) => {
    const b = new TextEncoder().encode(n);
    const out = new Uint8Array(Math.ceil((b.length + 1) / 4) * 4);
    out.set(b);
    return out;
  });
  const hdr = 0x14;
  const sfat = hdr;
  const sfnt = sfat + 12 + names.length * 16;
  const namesLen = nameBytes.reduce((a, b) => a + b.length, 0);
  const dataOff = Math.ceil((sfnt + 8 + namesLen) / 4) * 4;
  let total = dataOff;
  const starts = names.map((n) => {
    const s = total - dataOff;
    total += files[n]!.length;
    return s;
  });
  const out = new Uint8Array(total);
  const v = new DataView(out.buffer);
  out.set(new TextEncoder().encode("SARC"), 0);
  v.setUint16(4, hdr, true);
  out[6] = 0xff;
  out[7] = 0xfe; // BOM read big-endian = 0xFFFE => little-endian file
  v.setUint32(8, total, true);
  v.setUint32(0x0c, dataOff, true);
  v.setUint16(0x10, 0x100, true);
  out.set(new TextEncoder().encode("SFAT"), sfat);
  v.setUint16(sfat + 4, 12, true);
  v.setUint16(sfat + 6, names.length, true);
  let nameOff = 0;
  names.forEach((n, i) => {
    const e = sfat + 12 + i * 16;
    v.setUint32(e + 4, 0x01000000 | (nameOff / 4), true);
    v.setUint32(e + 8, starts[i]!, true);
    v.setUint32(e + 12, starts[i]! + files[n]!.length, true);
    nameOff += nameBytes[i]!.length;
  });
  out.set(new TextEncoder().encode("SFNT"), sfnt);
  v.setUint16(sfnt + 4, 8, true);
  let p = sfnt + 8;
  for (const b of nameBytes) {
    out.set(b, p);
    p += b.length;
  }
  names.forEach((n, i) => out.set(files[n]!, dataOff + starts[i]!));
  return out;
}
