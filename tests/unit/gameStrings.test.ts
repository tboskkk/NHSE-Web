import { expect, test } from "bun:test";
import items from "../../packages/core/src/generated/items.json";
import { GameStrings } from "../../packages/core/src/strings/gameStrings";
import { getKind, isFlowerGene } from "../../packages/core/src/items/itemInfo";
import { Item } from "../../packages/core/src/structures/item";

const fetcher = async (path: string) => JSON.parse(await Bun.file(new URL(`../../app/public/${path}`, import.meta.url).pathname).text());
const s = await GameStrings.load("en", fetcher);
const mk = (id: number, free = 0) => new Item(BigInt(id) | (BigInt(free >>> 0) << 32n));

test("plain, empty, unknown and special field ids", () => {
  expect(s.getItemName(new Item())).toBe("(None)");
  expect(s.getItemName(mk(0x0c0c))).toBe("flimsy fishing rod");
  expect(s.getItemNameById(65000)).toBe("???");
  expect(s.getItemNameById(63005)).toBe("Lloyd");
  const [fid, f] = Object.entries(items.fieldItems)[0]!;
  expect(s.getItemNameById(Number(fid))).toBe((f as { name: string }).name);
});

test("DIY recipes name what they make, unknown recipes show a padded id", () => {
  const [rid, made] = Object.entries(items.recipes)[0]!;
  expect(s.getItemName(mk(0x16a2, Number(rid)))).toBe(`${s.getItemNameById(0x16a2)} - ${s.getItemNameById(made as number)}`);
  expect(s.getItemName(mk(0x16a2, 7))).toBe(`${s.getItemNameById(0x16a2)} - 007`);
});

test("extension tiles use the extension item's name", () => {
  expect(s.getItemName(new Item(0xfffdn | (0x0c0cn << 32n)))).toBe("flimsy fishing rod");
});

test("flower genes render like .NET [Flags] enum names", () => {
  const id = Array.from({ length: 70000 }, (_, i) => i).find((i) => isFlowerGene(i))!;
  const base = s.getItemNameById(id);
  expect(s.getItemName(mk(id, 0))).toBe(base);
  expect(s.getItemName(mk(id, 0x30))).toBe(`${base} - w1, w2`);
  expect(s.getItemName(mk(id, 0x01))).toBe(`${base} - R1`);
});

test("trees show the item they will drop", () => {
  const id = Array.from({ length: 14987 }, (_, i) => i).find((i) => getKind(i) === "Kind_Tree");
  if (id === undefined) return; // no table-range tree ids in this data set
  const item = mk(id);
  item.count = 0x0c0c;
  expect(s.getItemName(item)).toBe(`${s.getItemNameById(id)} - flimsy fishing rod`);
});
