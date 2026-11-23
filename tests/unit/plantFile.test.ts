import { expect, test } from "bun:test";
import { loadPlantFile } from "../../scripts/models/plantFile";

const ROMFS = process.env.NHSE_TEST_ROMFS;
const t = ROMFS ? test : test.skip;

t("loadPlantFile dumps the cosmos models, their materials' texture names and the BNTX", async () => {
  const f = await loadPlantFile(ROMFS!, "PltFlwCosmos");
  expect(f.models.map((m) => m.name).sort()).toEqual(["PltFlwCosmos0", "PltFlwCosmos1", "PltFlwCosmos2", "PltFlwCosmosSeedling"]);
  const m2 = f.models.find((m) => m.name === "PltFlwCosmos2")!;
  expect(m2.materials.find((x) => x.name === "mCosmosFlower")?.textures).toContain("mCosmosColor00_Grd");
  expect(m2.materials.find((x) => x.name === "mCosmosBody")?.textures).toContain("mCosmosColor01_Grd");
  expect(m2.shapes.length).toBeGreaterThan(0);
  for (const s of m2.shapes) {
    expect(s.pos.length % 3).toBe(0);
    expect(s.nrm.length).toBe(s.pos.length);
    expect(s.uv.length / 2).toBe(s.pos.length / 3);
    expect(s.idx.length % 3).toBe(0);
    expect(s.skin).toBe(0);
  }
  expect(f.textures.map((x) => x.name)).toContain("mCosmosFlower_AlbGry");
}, 120_000);

t("loadPlantFile rejects a file that does not exist", async () => {
  await expect(loadPlantFile(ROMFS!, "PltDoesNotExist")).rejects.toThrow();
});

t("loadPlantFile accepts a family file that has no textures of its own", async () => {
  const f = await loadPlantFile(ROMFS!, "FldUnitRiver");
  expect(f.textures).toEqual([]);
  expect(f.models.length).toBe(45);
  expect(f.models.map((m) => m.name)).toContain("River1A_0");
}, 120_000);
