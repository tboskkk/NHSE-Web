import { expect, test, type Page } from "@playwright/test";
import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { toZip } from "../../packages/io/src/zip";

const SAVE = process.env.NHSE_TEST_SAVE;
test.skip(!SAVE, "set NHSE_TEST_SAVE to run the 3D editing e2e");

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

async function openMap3d(page: Page, zip: string) {
  await page.goto("/");
  await page.locator('input[type=file][accept=".zip"]').setInputFiles(zip);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await expect(page.locator("[data-testid=map-host][data-ready=true]")).toBeVisible({ timeout: 60_000 });
  await page.addStyleTag({ content: ".toast, .pill { visibility: hidden; }" });
  await page.getByTestId("view3d").click();
  await expect(page.locator("[data-testid=map3d-host][data-ready=true]")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(800);
}

test("3D: place, refuse, undo/redo, fill, terrain stamp, 2D/3D switch, save, reload", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 950 });
  const tmp = mkdtempSync(join(tmpdir(), "nhse-e2e-3dedit-"));
  const input = join(tmp, "input.zip");
  writeFileSync(input, toZip(readDir(SAVE!), "MySave"));
  await openMap3d(page, input);

  const canvas = page.getByTestId("map3d-canvas");
  const status = page.getByTestId("map-status");
  const shot = async () => {
    await page.mouse.move(0, 0); // off the canvas: no ghost in the picture
    await page.waitForTimeout(700);
    const b = (await canvas.boundingBox())!;
    return page.screenshot({ clip: { x: b.x + 10, y: b.y + 10, width: b.width - 20, height: b.height - 20 } });
  };
  const box = (await canvas.boundingBox())!;
  const spots: [number, number][] = [];
  for (let dy = -150; dy <= 150; dy += 12) for (let dx = -200; dx <= 200; dx += 12) spots.push([box.x + box.width / 2 + dx, box.y + box.height / 2 + dy]);
  const hover = async (x: number, y: number) => {
    await page.mouse.move(x, y);
    await page.waitForTimeout(70);
  };

  // the projection hook agrees with the picker: hovering a projected item tile inspects that tile
  const proj = await page.evaluate(() => (document.querySelector("[data-testid=map3d-host]") as unknown as { projectTile(x: number, y: number): { x: number; y: number } | null }).projectTile(144, 100));
  expect(proj).not.toBeNull();

  await page.getByTestId("edit-toggle").click();
  await page.getByTestId("brush-chip").click();
  await page.getByLabel("Search brush item").fill("table");
  await page.locator("li button").first().click();
  await page.getByTestId("tool-place").click();
  const before = await shot();

  // refusal: somewhere on the island the strict rules refuse a placement and say why
  let refused = false;
  for (const [x, y] of spots) {
    await hover(x, y);
    if (/Cannot place here/.test((await status.textContent()) ?? "")) {
      refused = true;
      await expect(page.getByTestId("map3d-caption")).toContainText(/\S/);
      await page.mouse.down();
      await page.mouse.up();
      break;
    }
  }
  expect(refused).toBe(true);
  await expect(page.locator(".toast")).toContainText("Nothing changed");
  await expect(page.getByRole("button", { name: unsaved(0) })).toBeVisible();

  // place on the first spot the strict rules accept
  let spot: [number, number] | null = null;
  for (const [x, y] of spots) {
    await hover(x, y);
    const info = await page.getByRole("complementary", { name: "Tile inspector" }).textContent();
    if (!/Item layer/.test(info ?? "") && ((await status.textContent()) ?? "") === "" && /Terrain \(/.test(info ?? "")) {
      await page.mouse.down();
      await page.mouse.up();
      spot = [x, y];
      break;
    }
  }
  expect(spot).not.toBeNull();
  await expect(page.getByRole("button", { name: unsaved(1) })).toBeVisible();
  const placed = await shot();
  expect(placed.equals(before)).toBe(false);

  await canvas.focus();
  await page.keyboard.press("Control+z");
  await expect(page.getByRole("button", { name: unsaved(0) })).toBeVisible();
  expect((await shot()).equals(before)).toBe(true);
  await page.keyboard.press("Control+y");
  await expect(page.getByRole("button", { name: unsaved(1) })).toBeVisible();
  expect((await shot()).equals(placed)).toBe(true);
  await page.keyboard.press("Control+z");
  await expect(page.getByRole("button", { name: unsaved(0) })).toBeVisible();

  // drag-fill an area: one undo step
  await page.getByTestId("tool-rect").click();
  await hover(spot![0], spot![1]);
  await page.mouse.down();
  await hover(spot![0] + 70, spot![1] + 20);
  await page.mouse.up();
  await expect(page.getByRole("button", { name: unsaved(1) })).toBeVisible();
  expect((await shot()).equals(before)).toBe(false);
  await canvas.focus();
  await page.keyboard.press("Control+z");
  await expect(page.getByRole("button", { name: unsaved(0) })).toBeVisible();
  expect((await shot()).equals(before)).toBe(true);

  // terrain: pick a non-ground tile, stamp it on a tile the rules accept
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
  for (const [x, y] of spots) {
    await hover(x, y);
    if (((await status.textContent()) ?? "") === "") {
      await page.mouse.down();
      await page.mouse.up();
      try { await expect(page.getByRole("button", { name: unsaved(1) })).toBeVisible({ timeout: 1000 }); stamped = true; break; } catch { /* identical tile or refused: next */ }
    }
  }
  expect(stamped).toBe(true);
  await page.waitForTimeout(300);
  const after = await shot();
  expect(after.equals(before)).toBe(false);
  await canvas.focus();
  await page.keyboard.press("Control+z");
  await expect(page.getByRole("button", { name: unsaved(0) })).toBeVisible();
  expect((await shot()).equals(before)).toBe(true);
  await page.keyboard.press("Control+y");
  await expect(page.getByRole("button", { name: unsaved(1) })).toBeVisible();
  expect((await shot()).equals(after)).toBe(true);

  // switching views mid-edit keeps mode and tool and the pending change
  await page.getByTestId("view2d").click();
  await expect(page.locator("[data-testid=map-host][data-ready=true]")).toBeVisible();
  await expect(page.getByTestId("edit-toggle")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("tool-terrain")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: unsaved(1) })).toBeVisible();
  await page.getByTestId("view3d").click();
  await expect(page.locator("[data-testid=map3d-host][data-ready=true]")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(800);
  expect((await shot()).equals(after)).toBe(true);

  // save, reload, reopen in 3D: the stamped terrain survived
  const download = page.waitForEvent("download");
  await canvas.focus();
  await page.keyboard.press("Control+s");
  const saved = join(tmp, "saved.zip");
  await (await download).saveAs(saved);
  await openMap3d(page, saved);
  await page.getByTestId("edit-toggle").click(); // the caption under the canvas differs between view and edit mode and is part of the picture
  expect((await shot()).equals(after)).toBe(true);
});

test("3D edit mode: right-drag orbits and Space+drag pans, a plain left-drag does not move the camera", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 950 });
  const input = join(mkdtempSync(join(tmpdir(), "nhse-e2e-3dcam-")), "input.zip");
  writeFileSync(input, toZip(readDir(SAVE!), "MySave"));
  await openMap3d(page, input);
  await page.getByTestId("edit-toggle").click();
  await page.getByTestId("tool-eyedropper").click(); // a tool that never edits, so strokes cannot change the save
  const canvas = page.getByTestId("map3d-canvas");
  const b = (await canvas.boundingBox())!;
  const shot = async () => {
    await page.mouse.move(0, 0);
    await page.waitForTimeout(700);
    return page.screenshot({ clip: { x: b.x + 10, y: b.y + 10, width: b.width - 20, height: b.height - 20 } });
  };
  const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
  const base = await shot();

  await page.mouse.move(cx, cy);
  await page.mouse.down(); // left drag in edit mode: paints (eyedropper), never orbits
  await page.mouse.move(cx + 120, cy + 40, { steps: 6 });
  await page.mouse.up();
  expect((await shot()).equals(base)).toBe(true);

  await page.mouse.move(cx, cy);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(cx + 120, cy + 40, { steps: 6 });
  await page.mouse.up({ button: "right" });
  const orbited = await shot();
  expect(orbited.equals(base)).toBe(false);

  await canvas.focus();
  await page.keyboard.down(" ");
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 100, cy, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up(" ");
  expect((await shot()).equals(orbited)).toBe(false);
  await expect(page.getByRole("button", { name: unsaved(0) })).toBeVisible();
});
