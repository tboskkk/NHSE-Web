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
