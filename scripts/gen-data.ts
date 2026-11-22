// Regenerates committed data tables from the real upstream NHSE.Core via the reference CLI.
// Outputs: packages/core/src/generated/{revisions,items}.json, app/public/data/lang/*.json, app/public/sprites/*
import { $ } from "bun";
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
process.env.DOTNET_ROOT ??= `${process.env.HOME}/.dotnet`;
process.env.PATH = `${process.env.HOME}/.dotnet:${process.env.PATH}`;

const tmp = mkdtempSync(join(tmpdir(), "nhse-gen-"));
try {
  await $`dotnet run -c Release --project ${root}reference -- export-data ${tmp}`;

  const gen = join(root, "packages/core/src/generated");
  const lang = join(root, "app/public/data/lang");
  const sprites = join(root, "app/public/sprites");
  mkdirSync(gen, { recursive: true });
  mkdirSync(lang, { recursive: true });
  mkdirSync(join(sprites, "menuicon"), { recursive: true });

  copyFileSync(join(tmp, "revisions.json"), join(gen, "revisions.json"));
  copyFileSync(join(tmp, "acretiles.bin"), join(lang, "..", "acretiles.bin"));

  const srcIcons = join(root, "vendor/NHSE/NHSE.Sprites/Resources/MenuIcon");
  const srcMisc = join(root, "vendor/NHSE/NHSE.Sprites/Resources/Misc");
  cpSync(srcIcons, join(sprites, "menuicon"), { recursive: true });
  copyFileSync(join(srcMisc, "leaf.png"), join(sprites, "leaf.png"));

  // items.json plus the list of menu-icon sprite files that actually exist (so lookups never 404).
  const items = JSON.parse(readFileSync(join(tmp, "items.json"), "utf8"));
  items.menuIconFiles = readdirSync(srcIcons).filter((f) => f.endsWith(".png")).map((f) => f.slice(0, -4)).sort();
  writeFileSync(join(gen, "items.json"), JSON.stringify(items));

  for (const f of readdirSync(join(tmp, "lang"))) copyFileSync(join(tmp, "lang", f), join(lang, f));
  console.log("generated data written");
} finally {
  if (existsSync(tmp)) rmSync(tmp, { recursive: true, force: true });
}
