import { expect } from "bun:test";
import { encrypt } from "../../packages/core/src/crypto/encryption";
import { HorizonSave, SaveLoadError, type SaveFiles } from "../../packages/core/src/save/horizonSave";
import { cloneFiles, goldenTest, readDir, SAVE } from "./helpers";

const load = () => readDir(SAVE!);

async function loadError(files: SaveFiles): Promise<SaveLoadError> {
  try {
    await HorizonSave.load(files);
  } catch (e) {
    return e as SaveLoadError;
  }
  throw new Error("expected load to fail");
}

goldenTest("unknown revision is rejected with a specific code", async () => {
  const f = cloneFiles(load());
  f.get("mainHeader.dat")![0x0e] = 99;
  const e = await loadError(f);
  expect(e).toBeInstanceOf(SaveLoadError);
  expect(e.code).toBe("unknown-revision");
});

goldenTest("size mismatch is rejected with a specific code", async () => {
  const f = cloneFiles(load());
  f.set("main.dat", f.get("main.dat")!.slice(0, -16));
  expect((await loadError(f)).code).toBe("size-mismatch");
});

goldenTest("missing main and missing player files are rejected", async () => {
  const f = cloneFiles(load());
  f.delete("main.dat");
  expect((await loadError(f)).code).toBe("missing-main");
  const g = cloneFiles(load());
  g.delete("Villager0/profile.dat");
  expect((await loadError(g)).code).toBe("missing-player-file");
});

goldenTest("multiple players load, sort numerically, and save", async () => {
  const f = cloneFiles(load());
  for (const [k, v] of [...f]) if (k.startsWith("Villager0/")) f.set(k.replace("Villager0/", "Villager1/"), v.slice());
  const sav = await HorizonSave.load(f);
  expect(sav.players.map((p) => p.directory)).toEqual(["Villager0", "Villager1"]);
  const out = await sav.save(1);
  expect([...out.keys()].filter((k) => k.startsWith("Villager1/")).length).toBe(8);
  expect([...out.keys()].filter((k) => k.startsWith("Villager0/")).length).toBe(8);
});

goldenTest("a save with already-invalid hashes loads with a warning and saving fixes it", async () => {
  const clean = await HorizonSave.load(load());
  const region = clean.main.revision.hash["main.dat"]!.regions[0]!;
  expect(clean.invalidHashes()).toEqual([]);

  // Build a file set whose main.dat has a corrupted byte inside a hashed region.
  const bad = cloneFiles(load());
  const data = clean.main.data.slice();
  data[region.start + 4] ^= 1;
  const enc = await encrypt(data, 7, clean.main.header);
  bad.set("main.dat", enc.data);
  bad.set("mainHeader.dat", enc.header);

  const sav = await HorizonSave.load(bad);
  const invalid = sav.invalidHashes();
  expect(invalid.length).toBe(1);
  expect(invalid[0]!.path).toBe("main");
  expect(invalid[0]!.region.hashOffset).toBe(region.hashOffset);

  const fixed = await HorizonSave.load(await sav.save(9));
  expect(fixed.invalidHashes()).toEqual([]);
});

goldenTest("save(seed, only) emits just the requested pairs", async () => {
  const sav = await HorizonSave.load(load());
  const out = await sav.save(3, new Set(["Villager0/personal"]));
  expect([...out.keys()].sort()).toEqual(["Villager0/personal.dat", "Villager0/personalHeader.dat"]);
});

goldenTest("save aborts when verification fails", async () => {
  const sav = await HorizonSave.load(load());
  const broken: typeof encrypt = async (...a) => {
    const r = await encrypt(...a);
    r.data[5] ^= 1;
    return r;
  };
  await expect(sav.save(5, new Set(["main"]), { encryptFn: broken })).rejects.toThrow(/verif/i);
});

goldenTest("non-pair files like landname.dat pass through untouched", async () => {
  const sav = await HorizonSave.load(load());
  expect([...sav.passthrough.keys()]).toContain("landname.dat");
});
