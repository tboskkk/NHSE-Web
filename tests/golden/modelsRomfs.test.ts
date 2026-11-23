import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import items from "../../packages/core/src/generated/items.json";
import { decodeGeometry, parseManifest } from "../../app/src/map3d/modelFormat";
import { generateModels, openRomfsModels } from "../../scripts/models/generate";

const ROMFS = process.env.NHSE_TEST_ROMFS;
const t = ROMFS ? test : test.skip;
const fieldItems = (items as unknown as { fieldItems: Record<string, { name: string }> }).fieldItems;
const out = () => join(mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "gen-golden-")), "pack");

t("exports an oak and red cosmos from a real romfs", async () => {
  const dir = out();
  const src = await openRomfsModels(ROMFS!);
  const a = await generateModels({ out: dir, only: "PltTreeOak4" }, fieldItems, src);
  const b = await generateModels({ out: dir, only: "PltFlwCosmos3Red" }, fieldItems, src);
  expect(a.items).toBeGreaterThan(0);
  expect(b.items).toBeGreaterThan(0);
  // the second run replaced models.json: check the cosmos, then regenerate the oak into its own folder
  const cosmos = parseManifest(readFileSync(join(dir, "models.json"), "utf8"));
  const key = Object.values(cosmos.items)[0]!;
  expect(key).toBe("PltFlwCosmos2@2");
  const g = decodeGeometry(new Uint8Array(readFileSync(join(dir, cosmos.models[key]!.geometry))));
  expect(g.positions.length).toBeGreaterThan(0);

  const dir2 = out();
  await generateModels({ out: dir2, only: "PltTreeOak4" }, fieldItems, src);
  const oak = parseManifest(readFileSync(join(dir2, "models.json"), "utf8"));
  const okey = Object.values(oak.items)[0]!;
  expect(okey.startsWith("PltTreeOak4@")).toBe(true);
  const og = decodeGeometry(new Uint8Array(readFileSync(join(dir2, oak.models[okey]!.geometry))));
  expect(og.indices.length).toBeGreaterThan(1000);
  const png = readFileSync(join(dir2, oak.models[okey]!.texture));
  expect(png.length).toBeGreaterThan(1000); // a blank atlas compresses far smaller
  // deterministic
  const dir3 = out();
  await generateModels({ out: dir3, only: "PltTreeOak4" }, fieldItems, src);
  expect(readFileSync(join(dir3, oak.models[okey]!.texture))).toEqual(png);
}, 180_000);

t("rejects a folder that is not a romfs dump", async () => {
  await expect(openRomfsModels("/nonexistent/romfs")).rejects.toThrow(/not a romfs dump/);
});

t("exports terrain pieces from a real romfs", async () => {
  const dir = out();
  const src = await openRomfsModels(ROMFS!);
  const r = await generateModels({ out: dir, only: "none", terrain: true }, fieldItems, src);
  const m = parseManifest(readFileSync(join(dir, "models.json"), "utf8"));
  expect(r.pieces).toBeGreaterThan(150);
  for (const k of ["1_0", "22_0", "59_0", "71_0"]) expect(m.terrain?.[k]).toBeDefined(); // River0A, Cliff0A, Fall100, RoadSoil0A
  expect(m.terrain!["1_0"]).toBe("River0A_0");
  const g = decodeGeometry(new Uint8Array(readFileSync(join(dir, m.models[m.terrain!["22_0"]!]!.geometry))));
  expect(g.indices.length).toBeGreaterThan(100);
  expect(m.models["River0A_0"]!.textures!.length).toBeGreaterThan(1);
  expect(readFileSync(join(dir, "tex/terrain/mCliff.png")).length).toBeGreaterThan(1000); // not blank
  const dir2 = out();
  await generateModels({ out: dir2, only: "none", terrain: true }, fieldItems, src);
  expect(readFileSync(join(dir2, "models.json"))).toEqual(readFileSync(join(dir, "models.json")));
}, 240_000);
