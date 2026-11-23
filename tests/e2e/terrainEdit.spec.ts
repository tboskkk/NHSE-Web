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


test("pick, stamp, refuse a fixed acre, undo/redo, save, reload", async ({ page }) => {
  const tmp = mkdtempSync(join(tmpdir(), "nhse-e2e-terrain-"));
  const input = join(tmp, "input.zip");
  writeFileSync(input, toZip(readDir(SAVE!), "MySave"));

  const openMap = async (zip: string) => {
    await page.goto("/");
    await page.locator('input[type=file][accept=".zip"]').setInputFiles(zip);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.getByRole("button", { name: "Map", exact: true }).click();
    await expect(page.locator("[data-testid=map-host][data-ready=true]")).toBeVisible({ timeout: 60_000 });
    await page.addStyleTag({ content: ".toast { visibility: hidden; }" });
  };
  await openMap(input);

  const canvas = page.getByTestId("map-canvas");
  const status = page.getByTestId("map-status");
  const shot = async () => {
    await page.mouse.move(0, 0);
    await page.waitForTimeout(150);
    const b = (await canvas.boundingBox())!;
    return page.screenshot({ clip: { x: b.x + 10, y: b.y + 10, width: b.width - 20, height: b.height - 20 } });
  };
  const box = (await canvas.boundingBox())!;
  const spots: [number, number][] = [];
  for (let dy = -150; dy <= 150; dy += 12) for (let dx = -200; dx <= 200; dx += 12) spots.push([box.x + box.width / 2 + dx, box.y + box.height / 2 + dy]);

  await page.getByTestId("edit-toggle").click();
  await page.getByTestId("tool-terrain").click();
  await page.getByTestId("terrain-mode-stamp").click();

  // pick a tile that is not plain ground (water, cliff, ...)
  let picked = false;
  for (const [x, y] of spots) {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.up();
    const text = (await page.getByTestId("terrain-picked").textContent({ timeout: 300 }).catch(() => null)) ?? "";
    if (text && !/Ground\s*base/.test(text)) { picked = true; break; }
    if (text) await page.getByTestId("terrain-repick").click();
  }
  expect(picked).toBe(true);

  const before = await shot();

  // refusal: somewhere on the shore a tile lies in a fixed acre
  let refused = false;
  for (const [x, y] of spots) {
    await page.mouse.move(x, y);
    await page.waitForTimeout(40);
    if (/fixed acre/.test((await status.textContent()) ?? "")) { refused = true; await page.mouse.down(); await page.mouse.up(); break; }
  }
  expect(refused).toBe(true);
  await expect(page.locator(".toast")).toContainText(/fixed acre/);
  await expect(page.getByRole("button", { name: unsaved(0) })).toBeVisible();

  // stamp on the first spot the strict rules accept
  let stamped = false;
  for (const [x, y] of spots) {
    await page.mouse.move(x, y);
    await page.waitForTimeout(40);
    if (((await status.textContent()) ?? "") === "") {
      await page.mouse.down();
      await page.mouse.up();
      try { await expect(page.getByRole("button", { name: unsaved(1) })).toBeVisible({ timeout: 1000 }); stamped = true; break; } catch { /* identical tile or refused: next */ }
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

  const download = page.waitForEvent("download");
  await page.keyboard.press("Control+s");
  const saved = join(tmp, "saved.zip");
  await (await download).saveAs(saved);
  await openMap(saved);
  await page.getByTestId("edit-toggle").click();
  expect((await shot()).equals(after)).toBe(true); // the stamped terrain survived save + reload
});
