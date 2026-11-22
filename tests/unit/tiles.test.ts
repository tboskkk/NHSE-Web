import { expect, test } from "bun:test";
import { screenToTile, tileToWorld, type GridSpec } from "../../app/src/map/tiles";

// 112x96 terrain grid, 16 world px per tile, origin at world (512, 512)
const grid: GridSpec = { tileSize: 16, width: 112, height: 96, originX: 512, originY: 512 };

test("screenToTile maps corners inside the grid", () => {
  const cam = { x: 512, y: 512, zoom: 1 };
  expect(screenToTile(cam, 0, 0, grid)).toEqual({ x: 0, y: 0 });
  expect(screenToTile(cam, 15.9, 15.9, grid)).toEqual({ x: 0, y: 0 });
  expect(screenToTile(cam, 16, 0, grid)).toEqual({ x: 1, y: 0 });
  expect(screenToTile(cam, 112 * 16 - 1, 96 * 16 - 1, grid)).toEqual({ x: 111, y: 95 });
});

test("screenToTile honours zoom and camera offset", () => {
  expect(screenToTile({ x: 512, y: 512, zoom: 2 }, 33, 0, grid)).toEqual({ x: 1, y: 0 });
  expect(screenToTile({ x: 0, y: 0, zoom: 1 }, 512 + 32, 512, grid)).toEqual({ x: 2, y: 0 });
});

test("screenToTile returns null outside the grid, on the border and for NaN", () => {
  const cam = { x: 512, y: 512, zoom: 1 };
  expect(screenToTile(cam, -1, 5, grid)).toBeNull();
  expect(screenToTile(cam, 5, -0.01, grid)).toBeNull();
  expect(screenToTile(cam, 112 * 16, 5, grid)).toBeNull();
  expect(screenToTile(cam, 5, 96 * 16, grid)).toBeNull();
  expect(screenToTile(cam, NaN, 5, grid)).toBeNull();
});

test("tileToWorld gives the tile's top-left corner", () => {
  expect(tileToWorld(grid, 0, 0)).toEqual({ x: 512, y: 512 });
  expect(tileToWorld(grid, 3, 2)).toEqual({ x: 512 + 48, y: 512 + 32 });
});
