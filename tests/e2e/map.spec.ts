import { expect, test } from "@playwright/test";
import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { toZip } from "../../packages/io/src/zip";

const SAVE = process.env.NHSE_TEST_SAVE;

function readDir(dir: string): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>();
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else out.set(relative(dir, p).split(sep).join("/"), new Uint8Array(readFileSync(p)));
    }
  };
  walk(dir);
  return out;
}

test.skip(!SAVE, "set NHSE_TEST_SAVE to run the map e2e");

test("map viewer renders, inspects and toggles layers", async ({ page }) => {
  const tmp = mkdtempSync(join(tmpdir(), "nhse-e2e-map-"));
  const input = join(tmp, "input.zip");
  writeFileSync(input, toZip(readDir(SAVE!), "MySave"));

  await page.goto("/");
  expect(await page.evaluate(() => !!document.createElement("canvas").getContext("webgl2"))).toBe(true);
  await page.locator('input[type=file][accept=".zip"]').setInputFiles(input);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Map", exact: true }).click();

  await expect(page.locator('[data-testid=map-host][data-ready=true]')).toBeVisible({ timeout: 60_000 });
  const canvas = page.getByTestId("map-canvas");
  const shot = () => canvas.screenshot();
  const distinct = (b: Buffer) => new Set(b.toString("base64").match(/.{1,64}/g)).size;

  const full = await shot();
  expect(distinct(full)).toBeGreaterThan(20); // not a uniform fill

  // Hover somewhere over the island: inspector stops showing the placeholder.
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByRole("complementary", { name: "Tile inspector" }).getByText(/\(\d+, \d+\)/).first()).toBeVisible();

  // Terrain off changes the picture.
  await page.getByLabel("Terrain", { exact: true }).uncheck();
  await expect.poll(async () => !(await shot()).equals(full)).toBe(true);

  // Sprite pack status starts empty.
  await expect(page.getByTestId("sprite-status")).toHaveText("sprites: 0 loaded");
});
