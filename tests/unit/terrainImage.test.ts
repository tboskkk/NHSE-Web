import { expect, test } from "bun:test";
import { classifyUnit, OCEAN_RGBA, terrainColor } from "../../app/src/map/terrainPalette";
import { ACRE_TEMPLATE_COUNT, classColor, renderTerrainRGBA } from "../../app/src/map/terrainImage";
import type { TerrainLayer } from "../../packages/core/src/map/mapData";

const luma = (argb: number) => ((argb >> 16) & 255) * 0.3 + ((argb >> 8) & 255) * 0.59 + (argb & 255) * 0.11;

test("classifyUnit boundaries follow upstream TerrainUnitModel ranges", () => {
  expect(classifyUnit(0x00)).toBe("base");
  expect(classifyUnit(0x01)).toBe("river");
  expect(classifyUnit(0x15)).toBe("river");
  expect(classifyUnit(0x16)).toBe("cliff");
  expect(classifyUnit(0x29)).toBe("cliff");
  expect(classifyUnit(0x93)).toBe("cliff");
  expect(classifyUnit(0x3a)).toBe("fall");
  expect(classifyUnit(0x92)).toBe("fall");
  expect(classifyUnit(0x47)).toBe("road");
  expect(classifyUnit(0x94)).toBe("road");
  expect(classifyUnit(0x111)).toBe("road");
  expect(classifyUnit(0x2a)).toBe("other");
});

test("higher elevation is never darker than lower on base land", () => {
  for (let e = 1; e <= 8; e++) expect(luma(terrainColor(0, e, 0))).toBeGreaterThanOrEqual(luma(terrainColor(0, e - 1, 0)));
});

test("a road model overrides the base color, and road materials differ", () => {
  const base = terrainColor(0, 0, 0);
  const soil = terrainColor(0, 0, 0x47);
  const stone = terrainColor(0, 0, 0x5c);
  expect(soil).not.toBe(base);
  expect(stone).not.toBe(soil);
});

const empty = (): TerrainLayer => {
  const z = () => new Uint16Array(112 * 96);
  return { width: 112, height: 96, unitModel: z(), variation: z(), angle: z(), roadModel: z(), roadVariation: z(), roadAngle: z(), elevation: z() };
};
const px = (img: { width: number; pixels: Uint8ClampedArray }, x: number, y: number) => Array.from(img.pixels.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 4));
const rgba = (argb: number) => [(argb >> 16) & 255, (argb >> 8) & 255, argb & 255, 255];

test("renderTerrainRGBA covers the 9x8-acre world; ocean outside land, palette inside", () => {
  const tiles = new Uint8Array(ACRE_TEMPLATE_COUNT * 256).fill(7);
  const img = renderTerrainRGBA(empty(), new Uint16Array(72), tiles, 2);
  expect([img.width, img.height]).toEqual([144 * 2, 128 * 2]);
  expect(px(img, 0, 0)).toEqual([...OCEAN_RGBA]);
  expect(px(img, 16 * 2, 16 * 2)).toEqual(rgba(terrainColor(0, 0, 0)));
});

test("a predefined acre template colors its tiles; class 7 falls back to dynamic", () => {
  const tiles = new Uint8Array(ACRE_TEMPLATE_COUNT * 256).fill(7);
  tiles.fill(4, 5 * 256, 6 * 256); // acre 5 = all sand (class 4)
  const acres = new Uint16Array(72);
  acres[0 * 9 + 3] = 5; // exterior acre column 3, row 0
  const img = renderTerrainRGBA(empty(), acres, tiles, 1);
  expect(px(img, 3 * 16 + 4, 4)).toEqual(rgba(classColor(4)!));
  expect(classColor(4)).toBe((240 << 16) | (230 << 8) | 170);
  expect(px(img, 5 * 16, 4)).toEqual([...OCEAN_RGBA]); // other exterior acres have acre 0 -> ocean
});
