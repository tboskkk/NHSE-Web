import { expect, test } from "bun:test";
import items from "../../packages/core/src/generated/items.json";
import { EXTENSION_ID, itemFootprint, makeExtension, NONE_RAW } from "../../packages/core/src/map/footprint";

const sizes = (items as unknown as { itemSizes: number[]; itemSizeTypes: { name: string; w: number; h: number }[] });
const idWith = (name: string) => sizes.itemSizes.findIndex((t) => sizes.itemSizeTypes[t]?.name === name);
const raw = (id: number, systemParam = 0) => BigInt(id) | (BigInt(systemParam) << 16n);

test("1x1 furniture occupies 2x2 item tiles", () => {
  expect(itemFootprint(raw(idWith("S_1_0x1_0")))).toMatchObject({ w: 2, h: 2 });
});

test("odd rotation swaps width and height", () => {
  const id = idWith("S_2_0x1_0");
  expect(itemFootprint(raw(id, 0))).toMatchObject({ w: 4, h: 2 });
  expect(itemFootprint(raw(id, 1))).toMatchObject({ w: 2, h: 4 });
  expect(itemFootprint(raw(id, 2))).toMatchObject({ w: 4, h: 2 });
});

test("buried and dropped items are the 1x1 size regardless of the item", () => {
  const id = idWith("S_3_0x3_0");
  expect(itemFootprint(raw(id, 0x04))).toMatchObject({ w: 2, h: 2 });
  expect(itemFootprint(raw(id, 0x20))).toMatchObject({ w: 2, h: 2 });
});

test("ids beyond the size table report unknownSize", () => {
  expect(itemFootprint(raw(0xfff0)).unknownSize).toBe(true);
});

test("makeExtension encodes root id and offsets", () => {
  const root = raw(idWith("S_2_0x2_0"), 0x01);
  const ext = makeExtension(root, 1, 3);
  expect(Number(ext & 0xffffn)).toBe(EXTENSION_ID);
  expect(Number((ext >> 16n) & 0xffffn)).toBe(0);
  expect(Number((ext >> 32n) & 0xffffn)).toBe(Number(root & 0xffffn));
  expect(Number((ext >> 48n) & 0xffn)).toBe(1);
  expect(Number((ext >> 56n) & 0xffn)).toBe(3);
  expect(NONE_RAW).toBe(0xfffen);
});
