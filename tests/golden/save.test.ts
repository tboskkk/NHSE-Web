import { expect } from "bun:test";
import { join } from "node:path";
import { HorizonSave } from "../../packages/core/src/save/horizonSave";
import { goldenTest, hash, readDir, runReference, SAVE, tempDir } from "./helpers";

goldenTest("decrypted bytes and hash results match upstream", async () => {
  const out = tempDir();
  await runReference(["dump", SAVE!, out]);
  const ref = JSON.parse(await Bun.file(join(out, "summary.json")).text());
  const sav = await HorizonSave.load(readDir(SAVE!));
  expect(sav.revision.index).toBe(ref.revisionIndex);
  for (const p of sav.pairs()) {
    const dec = new Uint8Array(await Bun.file(join(out, "decrypted", `${p.path}.dat`)).arrayBuffer());
    expect(p.data.length).toBe(dec.length);
    expect(hash(p.data)).toBe(hash(dec));
    const refFile = ref.files.find((f: { path: string }) => f.path === `${p.path}.dat`);
    expect(p.invalidHashes()).toEqual(refFile.invalidHashes);
  }
  expect(sav.pairs().length).toBe(ref.files.length);
});

goldenTest("same-seed save is byte-identical to upstream", async () => {
  const out = tempDir();
  await runReference(["save", SAVE!, "305419896", out]);
  const mine = await (await HorizonSave.load(readDir(SAVE!))).save(305419896);
  const theirs = readDir(out);
  expect(mine.size).toBeGreaterThan(0);
  for (const [k, v] of mine) {
    expect(theirs.has(k)).toBe(true);
    expect(hash(v)).toBe(hash(theirs.get(k)!));
  }
});
