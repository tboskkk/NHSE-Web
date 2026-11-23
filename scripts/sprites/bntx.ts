/** BNTX (Switch texture archive) reader: Tegra block-linear deswizzle and BC1 decode. */

export type BntxTexture = { name: string; format: number; width: number; height: number; blockHeightLog2: number; data: Uint8Array };

export function parseBntx(d: Uint8Array): BntxTexture[] {
  const str = (o: number, n: number) => String.fromCharCode(...d.subarray(o, o + n));
  if (d.length < 0x30 || str(0, 4) !== "BNTX") throw new Error("not a BNTX file");
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
  const n = v.getUint32(0x24, true);
  const info = Number(v.getBigUint64(0x28, true));
  const out: BntxTexture[] = [];
  for (let i = 0; i < n; i++) {
    const o = Number(v.getBigUint64(info + i * 8, true));
    if (str(o, 4) !== "BRTI") throw new Error("BNTX: bad texture header");
    const nameOff = Number(v.getBigUint64(o + 0x60, true));
    const nameLen = v.getUint16(nameOff, true);
    const ptrs = Number(v.getBigUint64(o + 0x70, true));
    const base = Number(v.getBigUint64(ptrs, true));
    out.push({
      name: new TextDecoder().decode(d.subarray(nameOff + 2, nameOff + 2 + nameLen)),
      format: v.getUint32(o + 0x1c, true),
      width: v.getUint32(o + 0x24, true),
      height: v.getUint32(o + 0x28, true),
      blockHeightLog2: v.getUint32(o + 0x34, true),
      data: d.slice(base, base + v.getUint32(o + 0x50, true)),
    });
  }
  return out;
}

/** Tegra X1 block-linear to row-major. Sizes are in compression blocks; `data` is the padded swizzled image. */
export function deswizzle(wBlocks: number, hBlocks: number, bpp: number, blockHeightLog2: number, data: Uint8Array): Uint8Array {
  const bh = 1 << blockHeightLog2;
  const pitch = Math.ceil((wBlocks * bpp) / 64) * 64;
  const out = new Uint8Array(wBlocks * hBlocks * bpp);
  for (let x = 0; x < wBlocks; x++) {
    const px = x * bpp;
    const colPart = Math.floor(px / 64) * (512 * bh) + (((px % 64) >> 5) * 256) + (((px % 32) >> 4) * 32) + (px % 16);
    for (let y = 0; y < hBlocks; y++) {
      const pos =
        Math.floor(y / (8 * bh)) * (512 * bh * (pitch / 64)) + colPart + (((y % (8 * bh)) >> 3) * 512) + (((y % 8) >> 1) * 64) + (y % 2) * 16;
      out.set(data.subarray(pos, pos + bpp), (y * wBlocks + x) * bpp);
    }
  }
  return out;
}

const expand = (c: number): [number, number, number] => [Math.floor(((c >> 11) & 31) * 255 / 31), Math.floor(((c >> 5) & 63) * 255 / 63), Math.floor((c & 31) * 255 / 31)];

/** BC1 to RGBA (w and h multiples of 4). Three-colour blocks make index 3 transparent. */
export function decodeBc1(w: number, h: number, raw: Uint8Array): Uint8Array {
  const out = new Uint8Array(w * h * 4);
  const bw = w >> 2;
  for (let by = 0; by < h >> 2; by++) {
    for (let bx = 0; bx < bw; bx++) {
      const o = (by * bw + bx) * 8;
      const c0 = raw[o]! | (raw[o + 1]! << 8);
      const c1 = raw[o + 2]! | (raw[o + 3]! << 8);
      const bits = (raw[o + 4]! | (raw[o + 5]! << 8) | (raw[o + 6]! << 16) | (raw[o + 7]! << 24)) >>> 0;
      const p0 = expand(c0), p1 = expand(c1);
      const four = c0 > c1;
      const pal: number[][] = [
        [...p0, 255],
        [...p1, 255],
        four ? [0, 1, 2].map((k) => Math.floor((2 * p0[k]! + p1[k]!) / 3)).concat(255) : [0, 1, 2].map((k) => Math.floor((p0[k]! + p1[k]!) / 2)).concat(255),
        four ? [0, 1, 2].map((k) => Math.floor((p0[k]! + 2 * p1[k]!) / 3)).concat(255) : [0, 0, 0, 0],
      ];
      for (let i = 0; i < 16; i++) {
        const c = pal[(bits >>> (2 * i)) & 3]!;
        out.set(c, ((by * 4 + (i >> 2)) * w + bx * 4 + (i & 3)) * 4);
      }
    }
  }
  return out;
}

/** Decoded first `_Alb` texture; `albCount` is how many `_Alb` textures the file held. */
export function albedo(textures: BntxTexture[]): { rgba: Uint8Array; width: number; height: number; albCount: number } {
  const alb = textures.filter((t) => t.name.endsWith("_Alb"));
  const t = alb[0];
  if (!t) throw new Error("no _Alb texture");
  if (t.format >> 8 !== 0x1a) throw new Error(`unsupported format 0x${t.format.toString(16)}`);
  const raw = deswizzle(t.width >> 2, t.height >> 2, 8, t.blockHeightLog2, t.data);
  return { rgba: decodeBc1(t.width, t.height, raw), width: t.width, height: t.height, albCount: alb.length };
}

/** BC4 to one byte per pixel (w and h multiples of 4); 8-value mode when a > b, else 6 values plus 0 and 255. */
export function decodeBc4(w: number, h: number, raw: Uint8Array): Uint8Array {
  const out = new Uint8Array(w * h);
  const bw = w >> 2;
  for (let by = 0; by < h >> 2; by++) {
    for (let bx = 0; bx < bw; bx++) {
      const o = (by * bw + bx) * 8;
      const a = raw[o]!, b = raw[o + 1]!;
      const pal = [a, b];
      if (a > b) for (let i = 1; i < 7; i++) pal.push(((7 - i) * a + i * b) / 7);
      else {
        for (let i = 1; i < 5; i++) pal.push(((5 - i) * a + i * b) / 5);
        pal.push(0, 255);
      }
      let bits = 0n;
      for (let i = 0; i < 6; i++) bits |= BigInt(raw[o + 2 + i]!) << BigInt(8 * i);
      for (let i = 0; i < 16; i++) out[(by * 4 + (i >> 2)) * w + bx * 4 + (i & 3)] = Math.round(pal[Number((bits >> BigInt(3 * i)) & 7n)]!);
    }
  }
  return out;
}

export type DecodedTexture = { width: number; height: number; channels: 1 | 4; data: Uint8Array };

/** Decodes the BNTX formats the plant models use: BC4 (grey), BC1 (RGBA) and RGBA8. */
export function decodeTexture(t: BntxTexture): DecodedTexture {
  switch (t.format >> 8) {
    case 0x1d:
      return { width: t.width, height: t.height, channels: 1, data: decodeBc4(t.width, t.height, deswizzle(t.width >> 2, t.height >> 2, 8, t.blockHeightLog2, t.data)) };
    case 0x1a:
      return { width: t.width, height: t.height, channels: 4, data: decodeBc1(t.width, t.height, deswizzle(t.width >> 2, t.height >> 2, 8, t.blockHeightLog2, t.data)) };
    case 0x0b:
      return { width: t.width, height: t.height, channels: 4, data: deswizzle(t.width, t.height, 4, t.blockHeightLog2, t.data) };
    default:
      throw new Error(`unsupported format 0x${t.format.toString(16)}`);
  }
}
