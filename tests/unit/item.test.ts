import { expect, test } from "bun:test";
import { Item } from "../../packages/core/src/structures/item";

test("Item decodes upstream raw layout (id, params, count/useCount)", () => {
  const i = new Item(0x0004000000000c0cn); // flimsy fishing rod, use count 4
  expect(i.itemId).toBe(0x0c0c);
  expect(i.systemParam).toBe(0);
  expect(i.additionalParam).toBe(0);
  expect(i.count).toBe(0);
  expect(i.useCount).toBe(4);
  expect(i.raw.toString(16).padStart(16, "0")).toBe("0004000000000c0c");
});

test("Item.NONE is 0xFFFE and an empty Item defaults to it", () => {
  const i = new Item();
  expect(i.isNone).toBe(true);
  expect(i.raw.toString(16).padStart(16, "0")).toBe("000000000000fffe");
});

test("Item reads and writes little-endian u64", () => {
  const buf = new Uint8Array(16);
  new Item(0x1122334455667788n).write(buf, 8);
  expect([...buf.slice(8)]).toEqual([0x88, 0x77, 0x66, 0x55, 0x44, 0x33, 0x22, 0x11]);
  expect(Item.read(buf, 8).raw).toBe(0x1122334455667788n);
});

test("bodyType uses the low 3 bits of freeParam and keeps the rest", () => {
  const i = new Item(5n);
  i.freeParam = 0b1111_1111;
  expect(i.bodyType).toBe(7);
  i.bodyType = 2;
  expect(i.freeParam).toBe(0b1111_1010);
});

test("patternChoice keeps the low 5 bits of freeParam", () => {
  const i = new Item(5n);
  i.freeParam = 0x1f;
  i.patternChoice = 3;
  expect(i.freeParam).toBe(0x1f | (3 << 5));
  expect(i.patternChoice).toBe(3);
});

test("system/additional param flags and wrapping", () => {
  const i = new Item(5n);
  i.isBuried = true;
  expect(i.systemParam).toBe(0x04);
  i.rotation = 3;
  expect(i.systemParam).toBe(0x07);
  i.isDropped = true;
  expect(i.systemParam & 0x20).toBe(0x20);
  i.isBuried = false;
  expect(i.systemParam).toBe(0x23);
  i.wrappingType = 2; // Present
  expect(i.additionalParam & 3).toBe(2);
  expect(i.isWrapped).toBe(true);
});

test("freeParam is a signed 32-bit value", () => {
  const i = new Item(5n);
  i.freeParam = -2;
  expect(i.freeParam).toBe(-2);
  expect(i.raw >> 32n).toBe(0xfffffffen);
  expect(i.itemId).toBe(5);
});

test("extension tiles display their root item id", () => {
  const i = new Item(0xfffdn | (0x1234n << 32n));
  expect(i.isExtension).toBe(true);
  expect(i.displayItemId).toBe(0x1234);
});
