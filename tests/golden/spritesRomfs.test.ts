import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importPack } from "../../app/src/map/spritePack";
import { openRomfs } from "../../scripts/sprites/romfs";
import { runAll } from "../../scripts/sprites/run";

const ROMFS = process.env.NHSE_TEST_ROMFS;
const t = ROMFS ? test : test.skip;

t("renders the wire chair from a real romfs into a pack the Map page accepts", async () => {
  const out = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "sprites-golden-"));
  const r = await runAll({ out, jobs: 2, only: "FtrWireChairS" }, await openRomfs(ROMFS!));
  expect(r.rendered).toBeGreaterThan(0);
  const file = join(out, "00770_3.png");
  expect(existsSync(file)).toBe(true);
  const png = new Uint8Array(readFileSync(file));
  const v = new DataView(png.buffer, png.byteOffset);
  expect([v.getUint32(16), v.getUint32(20)]).toEqual([64, 64]); // 2x2 footprint at 32 px
  expect(importPack([{ name: "00770_3.png", data: png }]).skipped).toBe(0);
}, 120_000);
