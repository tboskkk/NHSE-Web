import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodeGeometry, parseManifest } from "../../app/src/map3d/modelFormat";
import type { BntxTexture } from "../../scripts/sprites/bntx";
import { generateModels, type ModelSource } from "../../scripts/models/generate";
import type { DumpedModel } from "../../scripts/models/plantFile";
import { solidBc1, swizzle } from "./spriteFixtures";

/** 4x2 RGBA8 ramp (grass summer colour source). */
function rampTex(name: string): BntxTexture {
  const px = new Uint8Array(4 * 2 * 4);
  for (let i = 0; i < 8; i++) px.set([40, 160, 40, 255], i * 4);
  return { name, format: 0x0b06, width: 4, height: 2, blockHeightLog2: 0, data: swizzle(4, 2, 4, 0, px) };
}
const tri = (mat: string): DumpedModel["shapes"][number] => ({ name: "s", mat, skin: 0, pos: [-5, 0, -5, 5, 0, -5, -5, 0, 5], nrm: [0, 1, 0, 0, 1, 0, 0, 1, 0], uv: [0, 0, 1, 0, 0, 1], idx: [0, 1, 2] });
const piece = (name: string, mats: string[]): DumpedModel => ({
  name,
  materials: mats.map((m) => ({ name: m, textures: m === "mGrass" ? ["mGrass_Grd"] : ["mCliff_Alb"] })),
  shapes: mats.map(tri),
});

const family: DumpedModel[] = [piece("RiverA_0", ["mGrass", "mCliff"]), piece("RiverA_1", ["mCliff"])];
const baseTextures = [rampTex("mGrass_Grd"), solidBc1("mCliff_Alb", 0xf800) as BntxTexture];
const src = (over: Partial<ModelSource> = {}): ModelSource => ({
  fgMain: async () => new Map(),
  plant: async (f) => (f === "FldUnitRiverA" ? { models: family, textures: [] } : f === "FldUnit" ? { models: [], textures: baseTextures } : null),
  unitParam: async () => new Map([[1, "RiverA"], [2, "RiverA"]]),
  ...over,
});
const out = () => join(mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "gen-terrain-")), "pack");
const read = (d: string, p: string) => new Uint8Array(readFileSync(join(d, p)));

test("terrain export writes pieces with per-material textures and the terrain table", async () => {
  const dir = out();
  const r = await generateModels({ out: dir }, {}, src());
  const m = parseManifest(readFileSync(join(dir, "models.json"), "utf8"));
  expect(m.terrain).toEqual({ "1_0": "RiverA_0", "1_1": "RiverA_1", "2_0": "RiverA_0", "2_1": "RiverA_1" });
  expect(r.pieces).toBe(2);
  // materials sorted by name: mCliff, mGrass
  expect(m.models["RiverA_0"]!.textures).toEqual(["tex/terrain/mCliff.png", "tex/terrain/mGrass.png"]);
  expect(m.models["RiverA_0"]!.texture).toBe("tex/terrain/mCliff.png");
  expect(m.models["RiverA_1"]!.textures).toEqual(["tex/terrain/mCliff.png"]); // shared with the other piece
  expect(r.textures).toBe(2);
  const png = read(dir, "tex/terrain/mGrass.png");
  const v = new DataView(png.buffer, png.byteOffset);
  expect([v.getUint32(16), v.getUint32(20)]).toEqual([256, 256]);
});

test("piece geometry keeps raw tiling UVs and one index group per material", async () => {
  const dir = out();
  family[0]!.shapes[1]!.uv = [0, 0, 2.5, -1, 0, 1]; // mCliff tiles outside 0..1
  await generateModels({ out: dir }, {}, src());
  const m = parseManifest(readFileSync(join(dir, "models.json"), "utf8"));
  const g = decodeGeometry(read(dir, m.models["RiverA_0"]!.geometry));
  expect(g.groups).toEqual([{ start: 0, count: 3, material: 0 }, { start: 3, count: 3, material: 1 }]); // mCliff, mGrass
  expect([...g.uvs].slice(0, 6)).toEqual([0, 0, 2.5, -1, 0, 1]);
  expect(g.indices.length).toBe(6);
  expect(Math.max(...g.indices)).toBe(5);
  family[0]!.shapes[1]!.uv = [0, 0, 1, 0, 0, 1];
});

test("missing pieces and families are reported and the run continues", async () => {
  const dir = out();
  const r = await generateModels({ out: dir }, {}, src({ unitParam: async () => new Map([[1, "RiverA"], [5, "Gone3"]]), plant: async (f) => (f === "FldUnitRiverA" ? { models: [family[0]!], textures: [] } : f === "FldUnit" ? { models: [], textures: baseTextures } : null) }));
  expect(r.reasons["missing plant file FldUnitGone"]).toBe(1);
  const m = parseManifest(readFileSync(join(dir, "models.json"), "utf8"));
  expect(Object.keys(m.terrain ?? {})).toEqual(["1_0"]); // RiverA_1 does not exist in the family
});

test("a second run is byte-identical and terrain: false writes no pieces", async () => {
  const a = out(), b = out();
  await generateModels({ out: a }, {}, src());
  await generateModels({ out: b }, {}, src());
  for (const p of ["models.json", "geo/RiverA_0.bin", "tex/terrain/mGrass.png"]) expect(read(a, p)).toEqual(read(b, p));
  const c = out();
  await generateModels({ out: c, terrain: false }, {}, src());
  expect(existsSync(join(c, "tex/terrain/mGrass.png"))).toBe(false);
  expect(parseManifest(readFileSync(join(c, "models.json"), "utf8")).terrain).toBeUndefined();
});

test("--only skips terrain unless terrain is asked for", async () => {
  const a = out();
  await generateModels({ out: a, only: "nothing" }, {}, src());
  expect(existsSync(join(a, "tex/terrain/mGrass.png"))).toBe(false);
  const b = out();
  await generateModels({ out: b, only: "nothing", terrain: true }, {}, src());
  expect(existsSync(join(b, "tex/terrain/mGrass.png"))).toBe(true);
});
