import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodeGeometry, parseManifest } from "../../app/src/map3d/modelFormat";
import type { BntxTexture } from "../../scripts/sprites/bntx";
import { generateModels, type ModelSource } from "../../scripts/models/generate";
import type { DumpedModel } from "../../scripts/models/plantFile";
import type { PlantRef } from "../../scripts/models/fgmain";
import { swizzle } from "./spriteFixtures";

/** One BC4 block of a single grey value, as a 4x4 BNTX texture. */
function greyTex(name: string, g: number): BntxTexture {
  const block = new Uint8Array(8);
  block[0] = g; block[1] = g; // all indices 0 -> endpoint a
  return { name, format: 0x1d01, width: 4, height: 4, blockHeightLog2: 0, data: swizzle(1, 1, 8, 0, block) };
}
/** 4x2 RGBA8 ramp: row 0 red, row 1 green. */
function rampTex(name: string): BntxTexture {
  const px = new Uint8Array(4 * 2 * 4);
  for (let x = 0; x < 4; x++) { px.set([200, 20, 20, 255], x * 4); px.set([20, 200, 20, 255], (4 + x) * 4); }
  return { name, format: 0x0b06, width: 4, height: 2, blockHeightLog2: 0, data: swizzle(4, 2, 4, 0, px) };
}
const tri = (mat: string, name: string): DumpedModel["shapes"][number] => ({ name, mat, skin: 0, pos: [0, 0, 0, 1, 0, 0, 0, 1, 0], nrm: [0, 0, 1, 0, 0, 1, 0, 0, 1], uv: [0, 0, 1, 0, 0, 1], idx: [0, 1, 2] });
const model = (name: string, mats: [string, string[]][], shapes: [string, string][]): DumpedModel => ({
  name, materials: mats.map(([n, t]) => ({ name: n, textures: t })), shapes: shapes.map(([m, n]) => tri(m, n)),
});

const textures = [greyTex("mC_AlbGry", 90), greyTex("mA_AlbGry", 255), greyTex("mA_OP", 255), greyTex("mB_AlbGry", 0), rampTex("mAColor00_Grd"), rampTex("mBLeafColor_Grd")];
const plant = {
  models: [
    model("PltT1", [["mA", ["mA_AlbGry", "mA_OP", "mAColor00_Grd"]], ["mB", ["mB_AlbGry", "mBLeafColor_Grd"]], ["mShadow", []]], [["mA", "s1"], ["mB", "s2"], ["mShadow", "sh"]]),
    model("PltT1Node", [["mA", ["mA_AlbGry"]]], [["mA", "s1"]]),
    model("PltBroken", [["mC", ["mC_AlbGry", "mCColor00_Grd"]]], [["mC", "s1"]]),
  ],
  textures,
};
const fg = new Map<string, PlantRef>([
  ["Tree1", { file: "PltT", model: "PltT1", colour: null }],
  ["Flower2Red", { file: "PltT", model: "PltT1", colour: 1 }],
  ["TreeNode", { file: "PltT", model: "PltT1Node", colour: null }],
  ["Broken", { file: "PltT", model: "PltBroken", colour: null }],
  ["NoFile", { file: "PltGone", model: "PltGone0", colour: null }],
]);
const src: ModelSource = { fgMain: async () => fg, plant: async (f) => (f === "PltT" ? plant : null) };
const items = { "60000": { name: "Tree1" }, "60001": { name: "Flower2Red" }, "60002": { name: "TreeNode" }, "60003": { name: "Broken" }, "60004": { name: "NoFile" }, "60005": { name: "Fence" } };
const out = () => join(mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "gen-models-")), "pack");
const read = (dir: string, p: string) => new Uint8Array(readFileSync(join(dir, p)));

test("generateModels writes a manifest, geometry and baked atlases and reports every skip with its reason", async () => {
  const dir = out();
  const r = await generateModels({ out: dir }, items, src);
  const m = parseManifest(readFileSync(join(dir, "models.json"), "utf8"));
  expect(m.items["60000"]).toBe("PltT1@-");
  expect(m.items["60001"]).toBe("PltT1@1");
  expect(m.items["60002"]).toBeUndefined(); // Node model
  expect(m.items["60003"]).toBeUndefined(); // ramp missing from the BNTX
  expect(r.reasons["missing texture mCColor00_Grd"]).toBe(1);
  expect(r.reasons["skipped model kind"]).toBe(1);
  expect(r.reasons["missing plant file PltGone"]).toBe(1);
  expect(r.reasons["not in FgMainParam"]).toBe(1);
  expect(r.items).toBe(2);
  expect(r.models).toBe(1); // one geometry file, shared by both colours
  expect(r.textures).toBe(2);
  expect(existsSync(`${dir}.report.json`)).toBe(true);
  expect(readdirSync(join(dir, "tex")).length).toBe(2);
});

test("geometry keeps only textured shapes and remaps UVs into each material's atlas cell", async () => {
  const dir = out();
  await generateModels({ out: dir }, items, src);
  const m = parseManifest(readFileSync(join(dir, "models.json"), "utf8"));
  const g = decodeGeometry(read(dir, m.models["PltT1@-"]!.geometry));
  expect(g.positions.length / 3).toBe(6); // two textured triangles, the shadow shape is dropped
  // materials sorted by name: mA -> cell 0 (u in 0..0.5), mB -> cell 1 (u in 0.5..1)
  const us = [...g.uvs].filter((_, i) => i % 2 === 0);
  expect(Math.max(...us.slice(0, 3))).toBeLessThanOrEqual(0.5);
  expect(Math.min(...us.slice(3))).toBeGreaterThanOrEqual(0.5);
  expect(g.indices.length).toBe(6);
  expect(Math.max(...g.indices)).toBe(5);
});

test("the atlas PNG has one 128 px cell per textured material", async () => {
  const dir = out();
  await generateModels({ out: dir }, items, src);
  const m = parseManifest(readFileSync(join(dir, "models.json"), "utf8"));
  const png = read(dir, m.models["PltT1@1"]!.texture);
  const v = new DataView(png.buffer, png.byteOffset);
  expect([v.getUint32(16), v.getUint32(20)]).toEqual([256, 128]);
});

test("--only filters by item name or id", async () => {
  const dir = out();
  const r = await generateModels({ out: dir, only: "60001" }, items, src);
  expect(r.items).toBe(1);
  const r2 = await generateModels({ out: out(), only: "Tree1" }, items, src);
  expect(r2.items).toBe(1);
});

test("a second run produces identical bytes", async () => {
  const a = out(), b = out();
  await generateModels({ out: a }, items, src);
  await generateModels({ out: b }, items, src);
  for (const p of ["models.json", "geo/PltT1.bin", "tex/PltT_PltT1_-.png", "tex/PltT_PltT1_1.png"]) expect(read(a, p)).toEqual(read(b, p));
});
