import { expect, test } from "@playwright/test";
import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import items from "../../packages/core/src/generated/items.json";
import { toZip } from "../../packages/io/src/zip";
import { generateModels, openRomfsModels } from "../../scripts/models/generate";

const SAVE = process.env.NHSE_TEST_SAVE;
const ROMFS = process.env.NHSE_TEST_ROMFS;
test.skip(!SAVE || !ROMFS, "set NHSE_TEST_SAVE and NHSE_TEST_ROMFS to run the 3D terrain pieces e2e");

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
const unsaved = (n: number) => new RegExp(`${n} unsaved change`);

test("terrain pieces appear after importing the pack, and a terrain stamp redraws and undoes in 3D", async ({ page }) => {
  test.setTimeout(400_000);
  await page.setViewportSize({ width: 1500, height: 950 });
  const tmp = mkdtempSync(join(tmpdir(), "nhse-e2e-terrain3d-"));
  const packDir = join(tmp, "personal-models");
  const fieldItems = (items as unknown as { fieldItems: Record<string, { name: string }> }).fieldItems;
  await generateModels({ out: packDir, only: "none", terrain: true }, fieldItems, await openRomfsModels(ROMFS!)); // terrain pieces only
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
    await page.waitForTimeout(1500);
    const b = (await canvas.boundingBox())!;
    return page.screenshot({ clip: { x: b.x + 10, y: b.y + 10, width: b.width - 20, height: b.height - 20 } });
  };
  const flat = await shot();

  await page.locator("label.btn", { hasText: "Import .zip" }).locator("input").setInputFiles(packZip);
  await expect(page.getByTestId("model-status")).toContainText(/models: [1-9]\d* loaded/, { timeout: 60_000 });
  const withPieces = await shot();
  expect(withPieces.equals(flat)).toBe(false);

  // a terrain stamp redraws the pieces; undo restores the picture
  const status = page.getByTestId("map-status");
  const box = (await canvas.boundingBox())!;
  const spots: [number, number][] = [];
  for (let dy = -150; dy <= 150; dy += 12) for (let dx = -200; dx <= 200; dx += 12) spots.push([box.x + box.width / 2 + dx, box.y + box.height / 2 + dy]);
  const hover = async (x: number, y: number) => { await page.mouse.move(x, y); await page.waitForTimeout(70); };
  await page.getByTestId("edit-toggle").click();
  await page.getByTestId("tool-terrain").click();
  await page.getByTestId("terrain-mode-stamp").click();
  let picked = false;
  for (const [x, y] of spots) {
    await hover(x, y);
    await page.mouse.down();
    await page.mouse.up();
    const text = (await page.getByTestId("terrain-picked").textContent({ timeout: 300 }).catch(() => null)) ?? "";
    if (text && !/Ground\s*base/.test(text)) { picked = true; break; }
    if (text) await page.getByTestId("terrain-repick").click();
  }
  expect(picked).toBe(true);
  let stamped = false;
  let before = await shot();
  for (const [x, y] of spots) {
    await hover(x, y);
    if (((await status.textContent()) ?? "") === "") {
      await page.mouse.down();
      await page.mouse.up();
      try {
        await expect(page.getByRole("button", { name: unsaved(1) })).toBeVisible({ timeout: 1000 });
        if (!(await shot()).equals(before)) { stamped = true; break; }
        await canvas.focus();
        await page.keyboard.press("Control+z"); // a stamp that changes nothing visible: try the next spot
        await expect(page.getByRole("button", { name: unsaved(0) })).toBeVisible();
        before = await shot();
      } catch { /* refused or identical tile: next */ }
    }
  }
  expect(stamped).toBe(true);
  const after = await shot();
  expect(after.equals(before)).toBe(false);
  await canvas.focus();
  await page.keyboard.press("Control+z");
  await expect(page.getByRole("button", { name: unsaved(0) })).toBeVisible();
  expect((await shot()).equals(before)).toBe(true);
  await page.keyboard.press("Control+y");
  await expect(page.getByRole("button", { name: unsaved(1) })).toBeVisible();
  expect((await shot()).equals(after)).toBe(true);

  // Clear restores the flat look
  await page.getByTestId("view-toggle").click(); // back to view mode (no ghost or caption differences)
  await page.keyboard.press("Control+z");
  await expect(page.getByRole("button", { name: unsaved(0) })).toBeVisible();
  const flatAgain = async () => (await shot()).equals(flat);
  await page.getByRole("button", { name: /^Assets/ }).click(); // Clear lives in the Assets menu
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.getByTestId("model-status")).toHaveCount(0);
  expect(await flatAgain()).toBe(true); // no pack: the flat look is back
});
