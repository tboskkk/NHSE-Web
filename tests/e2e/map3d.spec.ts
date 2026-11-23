import { expect, test, type Page } from "@playwright/test";
import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { toZip } from "../../packages/io/src/zip";

const SAVE = process.env.NHSE_TEST_SAVE;
test.skip(!SAVE, "set NHSE_TEST_SAVE to run the 3D viewer e2e");

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

async function openMap(page: Page) {
  const zip = join(mkdtempSync(join(tmpdir(), "nhse-e2e-3d-")), "input.zip");
  writeFileSync(zip, toZip(readDir(SAVE!), "MySave"));
  await page.goto("/");
  await page.locator('input[type=file][accept=".zip"]').setInputFiles(zip);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await expect(page.locator("[data-testid=map-host][data-ready=true]")).toBeVisible({ timeout: 60_000 });
  await page.addStyleTag({ content: ".toast { visibility: hidden; }" });
}

test("3D view renders the island, responds to the camera keys and returns to 2D", async ({ page }) => {
  await openMap(page);
  await page.getByTestId("view3d").click();
  await expect(page.locator("[data-testid=map3d-host][data-ready=true]")).toBeVisible({ timeout: 30_000 });
  const canvas = page.getByTestId("map3d-canvas");
  await page.waitForTimeout(800);
  const a = await canvas.screenshot();
  expect(a.length).toBeGreaterThan(15_000); // a blank canvas compresses far smaller
  await canvas.focus();
  await page.keyboard.press("r");
  await page.waitForTimeout(400);
  const b = await canvas.screenshot();
  expect(Buffer.compare(a, b)).not.toBe(0);
  await expect(page.getByTestId("edit-toggle")).toBeDisabled();
  await page.getByTestId("view2d").click();
  await expect(page.locator("[data-testid=map-host][data-ready=true]")).toBeVisible();
});

test("without WebGL the 3D view explains itself and Back to 2D works", async ({ page }) => {
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (type === "webgl" || type === "webgl2") return null;
      return (orig as (...a: unknown[]) => unknown).call(this, type, ...rest) as never;
    } as typeof orig;
  });
  await openMap(page);
  await page.getByTestId("view3d").click();
  await expect(page.getByRole("alert")).toContainText(/3D view could not be shown/);
  await page.getByRole("button", { name: "Back to 2D" }).click();
  await expect(page.getByTestId("view2d")).toHaveAttribute("aria-pressed", "true");
});
