import { expect, test } from "@playwright/test";
import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import items from "../../packages/core/src/generated/items.json";
import { toZip } from "../../packages/io/src/zip";
import { generateModels, openRomfsModels } from "../../scripts/models/generate";

const SAVE = process.env.NHSE_TEST_SAVE;
const ROMFS = process.env.NHSE_TEST_ROMFS;
test.skip(!SAVE || !ROMFS, "set NHSE_TEST_SAVE and NHSE_TEST_ROMFS to run the 3D models e2e");

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

test("importing a model pack changes the 3D picture, and Clear restores the billboards", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1500, height: 950 });
  const tmp = mkdtempSync(join(tmpdir(), "nhse-e2e-models-"));
  const packDir = join(tmp, "personal-models");
  await generateModels({ out: packDir }, (items as unknown as { fieldItems: Record<string, { name: string }> }).fieldItems, await openRomfsModels(ROMFS!));
  const packZip = join(tmp, "models.zip");
  writeFileSync(packZip, toZip(readDir(packDir), "personal-models"));
  const saveZip = join(tmp, "input.zip");
  writeFileSync(saveZip, toZip(readDir(SAVE!), "MySave"));

  await page.goto("/");
  await page.locator('input[type=file][accept=".zip"]').first().setInputFiles(saveZip);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await expect(page.locator("[data-testid=map-host][data-ready=true]")).toBeVisible({ timeout: 60_000 });
  await page.addStyleTag({ content: ".toast, .pill { visibility: hidden; }" });
  await page.getByTestId("view3d").click();
  await expect(page.locator("[data-testid=map3d-host][data-ready=true]")).toBeVisible({ timeout: 30_000 });
  const canvas = page.getByTestId("map3d-canvas");
  const shot = async () => {
    await page.mouse.move(0, 0);
    await page.waitForTimeout(1200);
    const b = (await canvas.boundingBox())!;
    return page.screenshot({ clip: { x: b.x + 10, y: b.y + 10, width: b.width - 20, height: b.height - 20 } });
  };
  const before = await shot();

  await page.locator("label.btn", { hasText: "Import .zip" }).locator("input").setInputFiles(packZip);
  await expect(page.getByTestId("model-status")).toContainText(/models: [1-9]\d* loaded/, { timeout: 30_000 });
  const withModels = await shot();
  expect(withModels.equals(before)).toBe(false);

  await page.getByRole("button", { name: /^Assets/ }).click(); // Clear lives in the Assets menu
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.getByTestId("model-status")).toHaveCount(0); // the label only shows while a model pack is loaded
  expect((await shot()).equals(before)).toBe(true);
});
