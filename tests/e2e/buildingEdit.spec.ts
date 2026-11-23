import { expect, test } from "@playwright/test";
import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { toZip } from "../../packages/io/src/zip";

const SAVE = process.env.NHSE_TEST_SAVE;
test.skip(!SAVE, "set NHSE_TEST_SAVE to run the building editor e2e");

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
const MUSEUM = "5"; // slot of the Museum on the example island

test("move a building via the panel, undo/redo, save, reload; a rule violation is refused", async ({ page }) => {
  const tmp = mkdtempSync(join(tmpdir(), "nhse-e2e-bld-"));
  const input = join(tmp, "input.zip");
  writeFileSync(input, toZip(readDir(SAVE!), "MySave"));

  const openMap = async (zip: string) => {
    await page.goto("/");
    await page.locator('input[type=file][accept=".zip"]').setInputFiles(zip);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.getByRole("button", { name: "Map", exact: true }).click();
    await expect(page.locator("[data-testid=map-host][data-ready=true]")).toBeVisible({ timeout: 60_000 });
    await page.getByTestId("edit-toggle").click();
    await page.getByTestId("tool-building").click();
    await page.getByTestId("bld-select").selectOption(MUSEUM);
  };
  await openMap(input);

  const x = page.getByTestId("bld-x");
  const setX = async (v: number) => {
    await x.fill(String(v));
    await x.dispatchEvent("change");
  };
  const x0 = Number(await x.inputValue());

  // first delta the strict rules accept (the example island has trees and water around the Museum)
  let moved = x0;
  for (const d of [4, -4, 8, -8, 12, -12, 16, -16, 24, -24]) {
    await setX(x0 + d);
    try {
      await expect(page.getByRole("button", { name: unsaved(1) })).toBeVisible({ timeout: 1500 });
      moved = x0 + d;
      break;
    } catch {
      await expect(x).toHaveValue(String(x0)); // refused: the input reverted
    }
  }
  expect(moved).not.toBe(x0);
  await expect(x).toHaveValue(String(moved));

  await page.getByRole("button", { name: /^Undo/ }).click();
  await expect(page.getByRole("button", { name: unsaved(0) })).toBeVisible();
  await expect(x).toHaveValue(String(x0));
  await page.getByRole("button", { name: /^Redo/ }).click();
  await expect(page.getByRole("button", { name: unsaved(1) })).toBeVisible();
  await expect(x).toHaveValue(String(moved));

  const download = page.waitForEvent("download");
  await page.keyboard.press("Control+s");
  const saved = join(tmp, "saved.zip");
  await (await download).saveAs(saved);
  await openMap(saved);
  await expect(page.getByTestId("bld-x")).toHaveValue(String(moved)); // survived save + reload

  // refusal: a second Museum would break the one-per-type rule; nothing changes and the count does not grow
  const before = await page.getByRole("button", { name: /unsaved change/ }).textContent();
  await page.getByTestId("bld-select").selectOption("2");
  await page.getByTestId("bld-type").selectOption({ label: "Museum" });
  await expect(page.locator(".toast")).toContainText(/already used by slot/);
  expect(await page.getByRole("button", { name: /unsaved change/ }).textContent()).toBe(before);
});
