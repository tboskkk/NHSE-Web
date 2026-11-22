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

test.skip(!SAVE, "set NHSE_TEST_SAVE to run the round-trip");

test("load zip → edit wallet → save zip → reload → value persisted", async ({ page }) => {
  const tmp = mkdtempSync(join(tmpdir(), "nhse-e2e-"));
  const input = join(tmp, "input.zip");
  writeFileSync(input, toZip(readDir(SAVE!), "MySave"));

  await page.goto("/");
  await page.locator('input[type=file][accept=".zip"]').setInputFiles(input);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const name = await page.locator("#pname").inputValue();
  expect(name.length).toBeGreaterThan(0);

  const wallet = page.getByLabel("Wallet (Bells)");
  await wallet.fill("4321");
  await wallet.press("Enter");
  await expect(page.getByRole("button", { name: /1 change/ })).toBeVisible();

  const download = page.waitForEvent("download");
  await page.keyboard.press("Control+s"); // zip mode: no folder is open
  const saved = join(tmp, "saved.zip");
  await (await download).saveAs(saved);

  await page.goto("/");
  await page.locator('input[type=file][accept=".zip"]').setInputFiles(saved);
  await expect(page.getByLabel("Wallet (Bells)")).toHaveValue("4321");
  await expect(page.locator("#pname")).toHaveValue(name);
  await expect(page.getByRole("button", { name: /0 changes/ })).toBeVisible();
});
