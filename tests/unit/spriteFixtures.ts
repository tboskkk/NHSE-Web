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

/** Tegra X1 block-linear swizzle, written GOB by GOB (independent of the reader's closed formula). Output is padded to whole blocks. */
export function swizzle(wBlocks: number, hBlocks: number, bpp: number, blockHeightLog2: number, linear: Uint8Array): Uint8Array {
  const bh = 1 << blockHeightLog2;
  const pitch = Math.ceil((wBlocks * bpp) / 64) * 64;
  const gobCols = pitch / 64;
  const gobRows = Math.ceil(hBlocks / 8);
  const blockRows = Math.ceil(gobRows / bh);
  const out = new Uint8Array(blockRows * gobCols * bh * 512);
  for (let gy = 0; gy < gobRows; gy++) {
    for (let gx = 0; gx < gobCols; gx++) {
      const gobStart = ((Math.floor(gy / bh) * gobCols + gx) * bh + (gy % bh)) * 512;
      for (let row = 0; row < 8; row++) {
        const y = gy * 8 + row;
        if (y >= hBlocks) continue;
        for (let col = 0; col < 64; col++) {
          const px = gx * 64 + col;
          const x = Math.floor(px / bpp);
          if (x >= wBlocks) continue;
          // inside a GOB: 2 columns of 32 bytes, rows paired in 16-byte units
          const o = (col >> 5) * 256 + (row >> 1) * 64 + ((col >> 4) & 1) * 32 + (row & 1) * 16 + (col & 15);
          out[gobStart + o] = linear[(y * wBlocks + x) * bpp + (px % bpp)]!;
        }
      }
    }
  }
  return out;
}

export type FixtureTexture = { name: string; format: number; width: number; height: number; blockHeightLog2: number; data: Uint8Array };

/** Minimal BNTX holding the header fields the reader uses (same offsets as upstream files). */
export function buildBntx(textures: FixtureTexture[]): Uint8Array {
  const infoArr = 0x40;
  const brti = (i: number) => 0x100 + i * 0x100;
  const strBase = 0x100 + textures.length * 0x100;
  let p = strBase;
  const nameAt: number[] = [];
  for (const t of textures) {
    nameAt.push(p);
    p += 2 + new TextEncoder().encode(t.name).length + 1;
  }
  const ptrArr = p;
  p += textures.length * 8;
  const dataAt: number[] = [];
  for (const t of textures) {
    dataAt.push(p);
    p += t.data.length;
  }
  const out = new Uint8Array(p);
  const v = new DataView(out.buffer);
  out.set(new TextEncoder().encode("BNTX"), 0);
  out.set(new TextEncoder().encode("NX  "), 0x20);
  v.setUint32(0x24, textures.length, true);
  v.setBigUint64(0x28, BigInt(infoArr), true);
  textures.forEach((t, i) => {
    v.setBigUint64(infoArr + i * 8, BigInt(brti(i)), true);
    const o = brti(i);
    out.set(new TextEncoder().encode("BRTI"), o);
    v.setUint32(o + 0x1c, t.format, true);
    v.setUint32(o + 0x24, t.width, true);
    v.setUint32(o + 0x28, t.height, true);
    v.setUint32(o + 0x2c, 1, true);
    v.setUint32(o + 0x30, 1, true);
    v.setUint32(o + 0x34, t.blockHeightLog2, true);
    v.setUint32(o + 0x50, t.data.length, true);
    v.setBigUint64(o + 0x60, BigInt(nameAt[i]!), true);
    v.setBigUint64(o + 0x70, BigInt(ptrArr + i * 8), true);
    v.setUint16(nameAt[i]!, new TextEncoder().encode(t.name).length, true);
    out.set(new TextEncoder().encode(t.name), nameAt[i]! + 2);
    v.setBigUint64(ptrArr + i * 8, BigInt(dataAt[i]!), true);
    out.set(t.data, dataAt[i]!);
  });
  return out;
}
