import { expect, test } from "bun:test";
import { inflateSync } from "node:zlib";
import { importPack } from "../../app/src/map/spritePack";
import { encodePng } from "../../scripts/sprites/png";

const px = Uint8Array.of(255, 0, 0, 255, 0, 0, 255, 128);

test("encodePng writes a valid RGBA PNG that importPack accepts", () => {
  const png = encodePng(2, 1, px);
  expect([...png.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  const v = new DataView(png.buffer, png.byteOffset);
  expect(v.getUint32(16)).toBe(2); // IHDR width
  expect(v.getUint32(20)).toBe(1); // IHDR height
  expect(png[24]).toBe(8); // bit depth
  expect(png[25]).toBe(6); // RGBA
  const r = importPack([{ name: "00001_0.png", data: png }]);
  expect(r.skipped).toBe(0);
  expect(r.entries.has("1_0")).toBe(true);
});

test("encodePng IDAT inflates to filter-0 rows of the input pixels", () => {
  const png = encodePng(2, 1, px);
  const v = new DataView(png.buffer, png.byteOffset);
  let p = 8;
  const idat: Uint8Array[] = [];
  while (p < png.length) {
    const len = v.getUint32(p);
    const type = String.fromCharCode(...png.slice(p + 4, p + 8));
    if (type === "IDAT") idat.push(png.slice(p + 8, p + 8 + len));
    p += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  expect([...raw]).toEqual([0, ...px]);
});

test("encodePng rejects a pixel buffer of the wrong size", () => {
  expect(() => encodePng(2, 2, px)).toThrow();
});
