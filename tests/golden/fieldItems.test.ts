import { expect } from "bun:test";
import { join } from "node:path";
import items from "../../packages/core/src/generated/items.json";
import { heldItemId, spriteItemId } from "../../packages/core/src/map/fieldItems";
import { goldenTest, runReference, SAVE, tempDir } from "./helpers";

goldenTest("field item remap matches upstream FieldItemList / ItemSprite.TryGetFieldItemId", async () => {
  const out = tempDir();
  await runReference(["export-data", out]);
  const fresh = JSON.parse(await Bun.file(join(out, "items.json")).text());
  const N = fresh.kind.length;
  const ids = Object.keys(fresh.fieldItems).map(Number);
  expect(ids.length).toBeGreaterThan(100);
  for (const id of [...ids, 0, 5, 14986, 14987, 59999, 65000, 65535]) {
    const def = fresh.fieldItems[id];
    const held = def ? def.held : id;
    expect(heldItemId(id)).toBe(held);
    const want = id < N ? id : !def ? id : held >= N ? id : held;
    expect(spriteItemId(id, N)).toBe(want);
  }
  expect(items.fieldItems).toEqual(fresh.fieldItems);
});
