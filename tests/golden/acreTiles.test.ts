import { expect } from "bun:test";
import { join } from "node:path";
import { ACRE_TEMPLATE_COUNT, acreTileColor } from "../../app/src/map/terrainImage";
import { goldenTest, runReference, SAVE, tempDir } from "./helpers";

goldenTest("acre template colors match upstream AcreTileColor; committed bin equals a fresh export", async () => {
  const out = tempDir();
  await runReference(["export-data", out]);
  const colors: (number | null)[] = JSON.parse(await Bun.file(join(out, "acrecolors.json")).text());
  const fresh = new Uint8Array(await Bun.file(join(out, "acretiles.bin")).arrayBuffer());
  const committed = new Uint8Array(await Bun.file(new URL("../../app/public/data/acretiles.bin", import.meta.url).pathname).arrayBuffer());
  expect(fresh.length).toBe(ACRE_TEMPLATE_COUNT * 256);
  expect(Buffer.from(committed).equals(Buffer.from(fresh))).toBe(true);
  expect(colors.length).toBe(ACRE_TEMPLATE_COUNT * 256);
  for (let acre = 0; acre < ACRE_TEMPLATE_COUNT; acre++)
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) expect(acreTileColor(committed, acre, x, y)).toBe(colors[acre * 256 + y * 16 + x]!);
});
