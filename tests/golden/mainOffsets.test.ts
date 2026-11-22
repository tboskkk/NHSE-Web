import { expect } from "bun:test";
import { join } from "node:path";
import { HorizonSave } from "../../packages/core/src/save/horizonSave";
import { goldenTest, readDir, runReference, SAVE, tempDir } from "./helpers";

goldenTest("main offsets of the loaded revision match upstream MainSaveOffsets", async () => {
  const out = tempDir();
  await runReference(["dump", SAVE!, out]);
  const ref = JSON.parse(await Bun.file(join(out, "summary.json")).text());
  const sav = await HorizonSave.load(readDir(SAVE!));
  expect(ref.mainOffsets.fieldItem).toBeGreaterThan(0);
  expect(sav.revision.mainOffsets).toEqual(ref.mainOffsets);
});
