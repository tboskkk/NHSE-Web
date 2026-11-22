import { expect, test } from "@playwright/test";
import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { toZip } from "../../packages/io/src/zip";

const SAVE = process.env.NHSE_TEST_SAVE;
test.skip(!SAVE, "set NHSE_TEST_SAVE to run the map editor e2e");

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

test("place, refuse, undo/redo, save, reload; bulk weeds", async ({ page }) => {
  const tmp = mkdtempSync(join(tmpdir(), "nhse-e2e-edit-"));
  const input = join(tmp, "input.zip");
  writeFileSync(input, toZip(readDir(SAVE!), "MySave"));

  const openMap = async (zip: string) => {
    await page.goto("/");
    await page.locator('input[type=file][accept=".zip"]').setInputFiles(zip);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.getByRole("button", { name: "Map", exact: true }).click();
    await expect(page.locator("[data-testid=map-host][data-ready=true]")).toBeVisible({ timeout: 60_000 });
    await page.addStyleTag({ content: ".toast { visibility: hidden; }" }); // keep DOM overlays out of canvas screenshots
  };
  await openMap(input);

  const canvas = page.getByTestId("map-canvas");
  const status = page.getByTestId("map-status");
  const shot = async () => {
    await page.mouse.move(0, 0); // off the canvas: no ghost in the picture
    await page.waitForTimeout(150);
    const b = (await canvas.boundingBox())!; // inset: the focus ring and rounded corners are not map pixels
    return page.screenshot({ clip: { x: b.x + 10, y: b.y + 10, width: b.width - 20, height: b.height - 20 } });
  };

  await page.getByTestId("edit-toggle").click();
  await page.getByTestId("brush-chip").click();
  await page.getByLabel("Search brush item").fill("table");
  await page.locator("li button").first().click();
  await expect(page.getByTestId("brush-chip")).not.toContainText("nothing");
  await page.getByTestId("tool-place").click();

  const before = await shot();
  const box = (await canvas.boundingBox())!;

  // refusal: the Museum is drawn near the middle of the island; hover its label area until a refusal appears
  let refused = false;
  for (let dy = -120; dy <= 120 && !refused; dy += 12)
    for (let dx = -160; dx <= 160 && !refused; dx += 16) {
      await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
      refused = /Cannot place here/.test((await status.textContent()) ?? "");
    }
  expect(refused).toBe(true);
  await page.mouse.down();
  await page.mouse.up();
  await expect(page.locator(".toast")).toContainText("Nothing changed");
  await expect(page.getByRole("button", { name: unsaved(0) })).toBeVisible();

  // place on the first spot the strict rules accept
  let placed = false;
  for (let dy = -150; dy <= 150 && !placed; dy += 12)
    for (let dx = -200; dx <= 200 && !placed; dx += 12) {
      const x = box.x + box.width / 2 + dx, y = box.y + box.height / 2 + dy;
      await page.mouse.move(x, y);
      await page.waitForTimeout(30);
      const info = await page.getByRole("complementary", { name: "Tile inspector" }).textContent();
      if (!/Item layer/.test(info ?? "") && ((await status.textContent()) ?? "") === "" && /Terrain \(/.test(info ?? "")) {
        await page.mouse.down();
        await page.mouse.up();
        placed = true;
      }
    }
  expect(placed).toBe(true);
  await expect(page.getByRole("button", { name: unsaved(1) })).toBeVisible();
  const after = await shot();
  expect(after.equals(before)).toBe(false);

  await canvas.focus();
  await page.keyboard.press("Control+z");
  await expect(page.getByRole("button", { name: unsaved(0) })).toBeVisible();
  expect((await shot()).equals(before)).toBe(true);
  await page.keyboard.press("Control+y");
  await expect(page.getByRole("button", { name: unsaved(1) })).toBeVisible();
  expect((await shot()).equals(after)).toBe(true);

  const download = page.waitForEvent("download");
  await page.keyboard.press("Control+s");
  const saved = join(tmp, "saved.zip");
  await (await download).saveAs(saved);
  await openMap(saved);
  await page.getByTestId("edit-toggle").click();
  expect((await shot()).equals(after)).toBe(true); // the placed item survived save + reload

  // bulk weeds: dry run, confirm, one undo step, undo restores
  const pre = await shot();
  await page.getByTestId("bulk-weeds").click();
  await expect(page.getByTestId("bulk-summary")).toContainText("remove");
  await page.getByTestId("bulk-confirm").click();
  await expect(page.getByRole("button", { name: unsaved(1) })).toBeVisible();
  expect((await shot()).equals(pre)).toBe(false);
  await canvas.focus();
  await page.keyboard.press("Control+z");
  await expect(page.getByRole("button", { name: unsaved(0) })).toBeVisible();
  expect((await shot()).equals(pre)).toBe(true);
});
