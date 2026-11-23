import { expect, test } from "bun:test";
import { albedo, decodeBc1, deswizzle, parseBntx } from "../../scripts/sprites/bntx";
import { buildBntx, swizzle } from "./spriteFixtures";

const block = (c0: number, c1: number, bits: number) => Uint8Array.of(c0 & 255, c0 >> 8, c1 & 255, c1 >> 8, bits & 255, (bits >> 8) & 255, (bits >> 16) & 255, (bits >>> 24) & 255);

test("decodeBc1: four-colour block with all index 0 is solid colour 0", () => {
  const px = decodeBc1(4, 4, block(0xf800, 0x001f, 0));
  for (let i = 0; i < 16; i++) expect([...px.subarray(i * 4, i * 4 + 4)]).toEqual([255, 0, 0, 255]);
});

test("decodeBc1: three-colour block, index 3 is transparent and index 2 is the midpoint", () => {
  // pixel 0 -> index 3, pixel 1 -> index 2
  const px = decodeBc1(4, 4, block(0x001f, 0xf800, 3 | (2 << 2)));
  expect(px[3]).toBe(0);
  expect([...px.subarray(4, 8)]).toEqual([127, 0, 127, 255]);
});

test("decodeBc1: blocks land at their own 4x4 position", () => {
  const raw = new Uint8Array(16);
  raw.set(block(0xf800, 0, 0), 0);
  raw.set(block(0x001f, 0, 0), 8); // second block, right of the first
  const px = decodeBc1(8, 4, raw);
  expect([...px.subarray(0, 4)]).toEqual([255, 0, 0, 255]);
  expect([...px.subarray(4 * 4, 4 * 4 + 4)]).toEqual([0, 0, 255, 255]);
});

for (const bh of [0, 1, 2, 3, 4]) {
  test(`deswizzle inverts the block-linear swizzle (block height log2 ${bh})`, () => {
    const w = 20, h = 40, bpp = 8;
    const linear = Uint8Array.from({ length: w * h * bpp }, (_, i) => (i * 31 + (i >> 8)) & 255);
    expect([...deswizzle(w, h, bpp, bh, swizzle(w, h, bpp, bh, linear))]).toEqual([...linear]);
  });
}

test("parseBntx round-trips names, sizes, format and data", () => {
  const data = Uint8Array.of(1, 2, 3, 4);
  const [t, u] = parseBntx(
    buildBntx([
      { name: "A_Alb", format: 0x1a06, width: 4, height: 8, blockHeightLog2: 1, data },
      { name: "A_Nrm", format: 0x1a01, width: 16, height: 16, blockHeightLog2: 2, data: Uint8Array.of(7) },
    ]),
  );
  expect(t).toMatchObject({ name: "A_Alb", format: 0x1a06, width: 4, height: 8, blockHeightLog2: 1 });
  expect([...t!.data]).toEqual([1, 2, 3, 4]);
  expect(u!.name).toBe("A_Nrm");
  expect(() => parseBntx(new Uint8Array(0x60))).toThrow(/BNTX/);
});

const bc1Tex = (name: string, format: number, c0: number) => ({
  name,
  format,
  width: 4,
  height: 4,
  blockHeightLog2: 0,
  data: swizzle(1, 1, 8, 0, block(c0, 0, 0)),
});

test("albedo picks the first _Alb texture, decodes it and reports how many there were", () => {
  const tex = parseBntx(buildBntx([bc1Tex("X_Nrm", 0x1a01, 0x001f), bc1Tex("X_Alb", 0x1a06, 0xf800), bc1Tex("Y_Alb", 0x1a06, 0x001f)]));
  const a = albedo(tex);
  expect([a.width, a.height, a.albCount]).toEqual([4, 4, 2]);
  expect([...a.rgba.subarray(0, 4)]).toEqual([255, 0, 0, 255]);
});

test("albedo throws on a missing _Alb or a non-BC1 format", () => {
  expect(() => albedo(parseBntx(buildBntx([bc1Tex("X_Nrm", 0x1a01, 0)])))).toThrow(/no _Alb texture/);
  expect(() => albedo(parseBntx(buildBntx([bc1Tex("X_Alb", 0x1b01, 0)])))).toThrow(/unsupported format 0x1b01/);
});

// ---- BC4 / RGBA8 (plant textures) ----
import { decodeBc4, decodeTexture } from "../../scripts/sprites/bntx";

/** One BC4 block: endpoints a, b and sixteen 3-bit indices. */
function bc4Block(a: number, b: number, idx: number[]): Uint8Array {
  let bits = 0n;
  idx.forEach((v, i) => (bits |= BigInt(v) << BigInt(3 * i)));
  const out = new Uint8Array(8);
  out[0] = a;
  out[1] = b;
  for (let i = 0; i < 6; i++) out[2 + i] = Number((bits >> BigInt(8 * i)) & 0xffn);
  return out;
}

test("decodeBc4 eight-value mode (a > b): endpoints and the interpolated steps", () => {
  const px = decodeBc4(4, 4, bc4Block(255, 0, [0, 1, 2, 3, 4, 5, 6, 7, 0, 0, 0, 0, 0, 0, 0, 0]));
  expect([...px.subarray(0, 8)]).toEqual([255, 0, 219, 182, 146, 109, 73, 36]); // (6a+b)/7 .. (a+6b)/7, rounded
});

test("decodeBc4 six-value mode (a <= b): index 6 is 0 and index 7 is 255", () => {
  const px = decodeBc4(4, 4, bc4Block(0, 255, [0, 1, 2, 3, 4, 5, 6, 7, 0, 0, 0, 0, 0, 0, 0, 0]));
  expect([...px.subarray(0, 8)]).toEqual([0, 255, 51, 102, 153, 204, 0, 255]);
});

test("decodeBc4 puts each block at its own 4x4 position", () => {
  const raw = new Uint8Array(16);
  raw.set(bc4Block(200, 200, new Array(16).fill(0)), 0);
  raw.set(bc4Block(50, 50, new Array(16).fill(0)), 8);
  const px = decodeBc4(8, 4, raw);
  expect([px[0], px[4], px[3 * 8 + 3], px[3 * 8 + 4]]).toEqual([200, 50, 200, 50]);
});

test("decodeTexture decodes BC4 as one channel and RGBA8 as four", () => {
  const bc4Tex = { name: "g", format: 0x1d01, width: 4, height: 4, blockHeightLog2: 0, data: swizzle(1, 1, 8, 0, bc4Block(90, 90, new Array(16).fill(0))) };
  const g = decodeTexture(bc4Tex);
  expect([g.channels, g.width, g.height, g.data[0], g.data.length]).toEqual([1, 4, 4, 90, 16]);
  const linear = Uint8Array.from({ length: 8 * 8 * 4 }, (_, i) => (i * 7) & 255);
  const rgba = decodeTexture({ name: "r", format: 0x0b06, width: 8, height: 8, blockHeightLog2: 1, data: swizzle(8, 8, 4, 1, linear) });
  expect(rgba.channels).toBe(4);
  expect([...rgba.data]).toEqual([...linear]);
});

test("decodeTexture rejects formats it does not decode", () => {
  expect(() => decodeTexture({ name: "n", format: 0x1e02, width: 4, height: 4, blockHeightLog2: 0, data: new Uint8Array(512) })).toThrow(/unsupported format 0x1e02/);
});
