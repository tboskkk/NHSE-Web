import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseBntx } from "../../scripts/sprites/bntx";
import { type Shape, UNITS_PER_TILE as U } from "../../scripts/sprites/raster";
import { renderVariant } from "../../scripts/sprites/render";
import { openRomfs } from "../../scripts/sprites/romfs";
import { runAll, type Source } from "../../scripts/sprites/run";
import { buildBntx, solidBc1 } from "./spriteFixtures";

const quad = (w: number, d: number): Shape => ({ pos: [0, 0, 0, w, 0, 0, w, 0, d, 0, 0, d], uv: [0, 0, 65535, 0, 65535, 65535, 0, 65535], idx: [0, 1, 2, 0, 2, 3] });
const tex = (...t: ReturnType<typeof solidBc1>[]) => parseBntx(buildBntx(t));
const size = (png: Uint8Array) => {
  const v = new DataView(png.buffer, png.byteOffset);
  return [v.getUint32(16), v.getUint32(20)];
};

test("renderVariant draws on a footprint-sized canvas at 32 px per tile unit", async () => {
  const deps = { loadModel: async () => [quad(8 * U, 8 * U)], loadTextures: async () => tex(solidBc1("X_Alb", 0xf800)) };
  expect(size((await renderVariant(deps, { id: 770, model: "M" }, 0)).png)).toEqual([64, 64]); // 2x2 footprint
  expect(size((await renderVariant(deps, { id: 1557, model: "M" }, 0)).png)).toEqual([128, 64]); // 4x2 footprint
});

test("renderVariant sizes an unknown-size item from the model's bounding box, rounded up to whole tiles", async () => {
  const deps = { loadModel: async () => [quad(3 * U, 1.5 * U)], loadTextures: async () => tex(solidBc1("X_Alb", 0xf800)) };
  expect(size((await renderVariant(deps, { id: 30000, model: "M" }, 0)).png)).toEqual([96, 64]);
});

test("renderVariant reports reasons and the _Alb count", async () => {
  const two = { loadModel: async () => [quad(U, U)], loadTextures: async () => tex(solidBc1("A_Alb", 0xf800), solidBc1("B_Alb", 0x001f)) };
  expect((await renderVariant(two, { id: 770, model: "M" }, 0)).albCount).toBe(2);
  const noMesh = { ...two, loadModel: async () => [] as Shape[] };
  await expect(renderVariant(noMesh, { id: 770, model: "M" }, 0)).rejects.toThrow("no mesh");
  const badFmt = { ...two, loadTextures: async () => tex(solidBc1("A_Alb", 0, 0x1b01)) };
  await expect(renderVariant(badFmt, { id: 770, model: "M" }, 0)).rejects.toThrow("unsupported format 0x1b01");
});

function fakeSource(calls: string[]): Source {
  return {
    items: async () => [
      { id: 770, model: "A", variants: [0, 1] },
      { id: 771, model: "B", variants: [0] },
      { id: 772, model: "C", variants: [] },
    ],
    loadModel: async (m) => (calls.push(m), m === "B" ? [] : [quad(U, U)]),
    loadTextures: async () => tex(solidBc1("X_Alb", 0xf800)),
  };
}
const outDir = () => mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "sprites-run-"));

test("runAll records per-item failures and still renders the rest", async () => {
  const out = outDir();
  const r = await runAll({ out, jobs: 2 }, fakeSource([]));
  expect(r).toMatchObject({ rendered: 2, skipped: 2, existing: 0, reasons: { "no mesh": 1, "no ReBody variants": 1 } });
  expect(existsSync(join(out, "00770_0.png")) && existsSync(join(out, "00770_1.png"))).toBe(true);
  expect(existsSync(join(out, "00771_0.png"))).toBe(false);
  expect(JSON.parse(readFileSync(join(out, "report.json"), "utf8")).items["771_0"]).toBe("no mesh");
});

test("runAll is resumable: existing sprites are not re-rendered and the report stays complete", async () => {
  const out = outDir();
  await runAll({ out, jobs: 2 }, fakeSource([]));
  const calls: string[] = [];
  const r = await runAll({ out, jobs: 2 }, fakeSource(calls));
  expect(calls).not.toContain("A");
  expect(r).toMatchObject({ rendered: 0, existing: 2, skipped: 2 });
  expect(r.items["770_1"]).toBe("existing");
});

test("runAll --only filters by id or model name", async () => {
  const out = outDir();
  expect((await runAll({ out, jobs: 1, only: "770" }, fakeSource([]))).rendered).toBe(2);
  expect((await runAll({ out: outDir(), jobs: 1, only: "B" }, fakeSource([]))).skipped).toBe(1);
});

test("openRomfs rejects a folder that is not a romfs dump", async () => {
  await expect(openRomfs("/nonexistent/romfs")).rejects.toThrow(/romfs/);
});
