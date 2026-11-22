import { expect, test } from "bun:test";
import items from "../../packages/core/src/generated/items.json";
import { heldItemId, spriteItemId } from "../../packages/core/src/map/fieldItems";

const N = items.kind.length;

test("ids below the item count are unchanged", () => {
  expect(spriteItemId(1234, N)).toBe(1234);
  expect(spriteItemId(0, N)).toBe(0);
});

test("field items remap to their held item (oak tree 60000 -> 2799 via Dig, since Pick is none)", () => {
  expect(heldItemId(60000)).toBe(2799);
  expect(spriteItemId(60000, N)).toBe(2799);
});

test("unknown field ids and held ids beyond the item count are unchanged", () => {
  expect(heldItemId(65000)).toBe(65000);
  expect(spriteItemId(65000, N)).toBe(65000);
  expect(spriteItemId(60000, 100)).toBe(60000); // held 2799 >= length 100 -> keep id
});
