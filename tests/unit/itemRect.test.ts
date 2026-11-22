import { expect, test } from "bun:test";
import { itemSpriteRect } from "../../app/src/map/itemRect";
import { makeExtension } from "../../packages/core/src/map/footprint";
import { idOfSize, rawOf } from "./mapFixture";

test("a 2x2-unit root is drawn four item tiles square", () => {
  expect(itemSpriteRect(rawOf(idOfSize("S_2_0x2_0")), 16)).toEqual({ w: 64, h: 64 });
});

test("a 1x1-unit root is two tiles square", () => {
  expect(itemSpriteRect(rawOf(idOfSize("S_1_0x1_0")), 16)).toEqual({ w: 32, h: 32 });
});

test("rotation swaps the drawn width and height", () => {
  const id = idOfSize("S_2_0x1_0");
  expect(itemSpriteRect(rawOf(id, 0), 16)).toEqual({ w: 64, h: 32 });
  expect(itemSpriteRect(rawOf(id, 1), 16)).toEqual({ w: 32, h: 64 });
});

test("extension and empty tiles draw nothing", () => {
  expect(itemSpriteRect(makeExtension(rawOf(idOfSize("S_2_0x2_0")), 1, 1), 16)).toBeNull();
  expect(itemSpriteRect(0xfffen, 16)).toBeNull();
});
