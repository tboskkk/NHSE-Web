import { expect, test } from "bun:test";
import { modelBounds, renderTop, type Shape } from "../../scripts/sprites/raster";

const RED = [255, 0, 0, 255], GREEN = [0, 255, 0, 255], BLUE = [0, 0, 255, 255], WHITE = [255, 255, 255, 255];
const tex2x2 = { rgba: Uint8Array.from([...RED, ...GREEN, ...BLUE, ...WHITE]), width: 2, height: 2 };
const M = 65535;

/** Axis-aligned quad in the XZ plane at height y covering [x0,x1] x [z0,z1], uv spanning (u0,v0)-(u1,v1) in texture space (0..1). */
function quad(x0: number, x1: number, z0: number, z1: number, y = 0, uv = [0, 0, 1, 1]): Shape {
  const [u0, v0, u1, v1] = uv.map((n) => Math.round(n * M)) as [number, number, number, number];
  return { pos: [x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1], uv: [u0, v0, u1, v0, u1, v1, u0, v1], idx: [0, 1, 2, 0, 2, 3] };
}
const px = (img: Uint8Array, w: number, x: number, y: number) => [...img.subarray((y * w + x) * 4, (y * w + x) * 4 + 4)];
const opaque = (img: Uint8Array) => img.reduce((n, _, i) => (i % 4 === 3 && img[i] === 255 ? n + 1 : n), 0);

test("modelBounds spans the XZ extent and is null without vertices", () => {
  expect(modelBounds([quad(1, 5, 2, 4)])).toEqual({ minX: 1, maxX: 5, minZ: 2, maxZ: 4 });
  expect(modelBounds([])).toBeNull();
});

test("a model smaller than the canvas keeps its pixel scale and is centred", () => {
  const img = renderTop([quad(0, 4, 0, 4)], tex2x2, { w: 8, h: 8 }, 1)!;
  expect(opaque(img)).toBe(16);
  expect(px(img, 8, 2, 2)).toEqual(RED);
  expect(px(img, 8, 5, 2)).toEqual(GREEN);
  expect(px(img, 8, 2, 5)).toEqual(BLUE);
  expect(px(img, 8, 5, 5)).toEqual(WHITE);
  expect(px(img, 8, 1, 1)[3]).toBe(0);
});

test("a model larger than the canvas is scaled down uniformly to fit", () => {
  const img = renderTop([quad(0, 16, 0, 8)], tex2x2, { w: 8, h: 8 }, 1)!;
  // 16x8 model into 8x8: scale 0.5 -> 8x4, centred vertically
  expect(opaque(img)).toBe(32);
  expect(px(img, 8, 0, 2)[3]).toBe(255);
  expect(px(img, 8, 7, 5)[3]).toBe(255);
  expect(px(img, 8, 0, 1)[3]).toBe(0);
});

test("the nearer (higher y) surface wins whatever the draw order", () => {
  const low = quad(0, 4, 0, 4, 0, [0.1, 0.1, 0.4, 0.4]); // red texel
  const high = quad(0, 4, 0, 4, 5, [0.6, 0.1, 0.9, 0.4]); // green texel
  for (const shapes of [[low, high], [high, low]]) {
    const img = renderTop(shapes, tex2x2, { w: 4, h: 4 }, 1)!;
    expect(px(img, 4, 1, 1)).toEqual(GREEN);
  }
});

test("degenerate models render nothing instead of NaN", () => {
  expect(renderTop([], tex2x2, { w: 8, h: 8 }, 1)).toBeNull();
  expect(renderTop([quad(0, 4, 0, 0)], tex2x2, { w: 8, h: 8 }, 1)).toBeNull();
  expect(renderTop([{ pos: [0, 0, 0, 1, 0, 0, 1, 0, 1], uv: [0, 0, 0, 0, 0, 0], idx: [0, 1, 2] }], tex2x2, { w: 0, h: 8 }, 1)).toBeNull();
});
