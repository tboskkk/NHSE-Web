import { expect, test } from "bun:test";
import items from "../../packages/core/src/generated/items.json";
import en from "../../app/public/data/lang/en.json";
import { REVISIONS, findRevision } from "../../packages/core/src/save/revisions";
import {
  getKind, getMenuIconSprite, isClothing, isCrafting, isFlowerGene, isFurniture, recipeItem, remakeInfo,
} from "../../packages/core/src/items/itemInfo";

test("35 revisions, 3.0.3 is index 34 with REV_300 sizes", () => {
  expect(REVISIONS.length).toBe(35);
  const r = REVISIONS[34]!;
  expect(r.label).toBe("3.0.3");
  expect(r.header).toMatchObject({ major: 0xa0002, minor: 0xa0028, saveRevision: 34 });
  expect(r.sizes.main).toBe(10161808);
  expect(r.sizes.personal).toBe(477760);
  expect(r.personalOffsets.Pockets1).toBe(0x37be0 + 0x10);
  expect(r.hash["main.dat"]!.size).toBe(10161808);
  expect(r.hash["personal.dat"]!.regions.length).toBe(2);
});

test("findRevision resolves exact header tuples and rejects unknown ones", () => {
  const h = { major: 0xa0002, minor: 0xa0028, unk1: 2, headerRevision: 0, unk2: 2, saveRevision: 34 };
  expect(findRevision(h)?.index).toBe(34);
  expect(findRevision({ ...h, saveRevision: 99 })).toBeUndefined();
  expect(findRevision({ ...h, saveRevision: 31 })?.label).toBe("3.0.0");
});

test("item tables line up", () => {
  expect(items.kind.length).toBe(14987);
  expect(en.items.length).toBe(14987);
  expect(en.items[0]).toBe("(Item #000)"); // display list; empty slots use noneName (itemlist[0])
  expect(en.noneName).toBe("(None)");
  expect(getKind(0x16a2)).toBe("Kind_DIYRecipe");
});

test("kind helpers and sprites", () => {
  expect(getKind(60000)).not.toBe("Unknown"); // field item resolved via fieldItems
  expect(getKind(65000)).toBe("Unknown");
  expect(isFurniture(79)).toBe(true); // baby bed
  expect(isClothing(79)).toBe(false);
  expect(isCrafting(0x16a2)).toBe(false);
  expect(getMenuIconSprite(0xffff)).toBe("sprites/leaf.png");
  expect(getMenuIconSprite(0x16a2)).toMatch(/^sprites\/(menuicon\/[A-Za-z0-9_]+|leaf)\.png$/);
  expect(isFlowerGene(60000)).toBe(false);
});

test("remake and recipe lookups", () => {
  const info = remakeInfo(79);
  expect(info).toBeDefined();
  expect(info!.body.length + info!.fabric.length).toBeGreaterThan(0);
  expect(remakeInfo(0)).toBeUndefined();
  const [recipeId, itemId] = Object.entries(items.recipes)[0]!;
  expect(recipeItem(Number(recipeId))).toBe(itemId as number);
  expect(recipeItem(99999)).toBeUndefined();
});

test("every revision carries main save offsets; item acre width is 9 from 3.0.0", () => {
  for (const r of REVISIONS) {
    const o = r.mainOffsets;
    for (const k of ["fieldItem", "landMakingMap", "mainFieldStructure", "outsideField", "fieldItemAcreWidth"] as const)
      expect(typeof o[k]).toBe("number");
    expect(o.fieldItemAcreWidth).toBe(r.index >= 31 ? 9 : 7);
  }
});
