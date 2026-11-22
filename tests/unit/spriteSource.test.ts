import { expect, test } from "bun:test";
import { getMenuIconSprite, LEAF_SPRITE } from "../../packages/core/src/items/itemInfo";
import items from "../../packages/core/src/generated/items.json";
import { createSpriteSource } from "../../app/src/map/spriteSource";

const N = items.kind.length;
const iconId = (() => { for (let i = 1; i < N; i++) if (getMenuIconSprite(i) !== LEAF_SPRITE) return i; throw new Error("no icon item"); })();

test("lookup order: id_count, then id_0, then menu icon, then leaf", () => {
  const pack = new Map([[`${iconId}_5`, "blob:five"], [`${iconId}_0`, "blob:zero"]]);
  const s = createSpriteSource(pack, N, "/b/");
  expect(s.resolve(iconId, 5)).toEqual({ kind: "pack", url: "blob:five" });
  expect(s.resolve(iconId, 3)).toEqual({ kind: "pack", url: "blob:zero" });
  const none = createSpriteSource(new Map(), N, "/b/");
  expect(none.resolve(iconId, 0)).toEqual({ kind: "icon", url: `/b/${getMenuIconSprite(iconId)}` });
  expect(none.resolve(65000, 0)).toEqual({ kind: "leaf", url: `/b/${LEAF_SPRITE}` });
});

test("placed field items are remapped to their held item before lookup", () => {
  const pack = new Map([["2799_0", "blob:oak"]]);
  expect(createSpriteSource(pack, N, "/").resolve(60000, 0)).toEqual({ kind: "pack", url: "blob:oak" });
});
