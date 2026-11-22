import { expect } from "bun:test";
import { join } from "node:path";
import { itemFootprint } from "../../packages/core/src/map/footprint";
import { goldenTest, runReference, tempDir } from "./helpers";

goldenTest("itemFootprint matches upstream GetItemSize for every id and rotation", async () => {
  const file = join(tempDir(), "sizes.json");
  await runReference(["item-size", file]);
  const ref: number[] = JSON.parse(await Bun.file(file).text());
  expect(ref.length).toBe(65536 * 4 * 2);
  let bad = 0;
  for (let id = 0; id < 65536; id++)
    for (let rot = 0; rot < 4; rot++) {
      const f = itemFootprint(BigInt(id) | (BigInt(rot) << 16n));
      const i = (id * 4 + rot) * 2;
      if (f.w !== ref[i] || f.h !== ref[i + 1]) bad++;
    }
  expect(bad).toBe(0);
});
