# Map 3D Natural-Item Models Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `bun run gen:models --romfs <dir>` exports the game's tree, bush, flower, weed and stump models into a git-ignored pack that the Map page imports, and the 3D view draws them (summer colours, lit, alpha-cut) instead of icons.

**Architecture:** Offline TS pipeline in `scripts/models/` (BCSV join -> BFRES dump via the existing C# helper -> texture decode -> ramp bake -> pack writer); a small shared pack format module in `app/src/map3d/`; the browser parses the pack, stores the raw files in IndexedDB, and `scene3d.ts` draws one `InstancedMesh` per model key; items without a model keep the current billboards.

**Tech Stack:** bun, TypeScript strict, .NET 10 helper (BfresLibrary), three.js 0.180.0 (installed), Svelte 5, bun test, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-23-map-3d-models-design.md` (spike P findings are in its first section).

## Global Constraints
- Never commit Nintendo art, romfs bytes or generated output: `personal-models/` and `personal-models.report.json` are git-ignored; test fixtures are synthetic.
- Pack format (version 1): `models.json` = `{ "version": 1, "items": { "<itemId>": "<modelKey>" }, "models": { "<modelKey>": { "geometry": "geo/<model>.bin", "texture": "tex/<file>_<model>_<colour>.png" } } }`; model key = `<model>@<colour>` (colour `-` when the item has none, i.e. FgMainParam value 255). Geometry file = little-endian: u32 magic `0x4C444D4E` ("NMDL"), u32 vertexCount, u32 indexCount, then float32 positions (x3), float32 normals (x3), float32 uvs (x2) per vertex, then u32 indices. UVs address a horizontal atlas of K square cells (K = textured materials of the model, sorted by material name): `u' = (u + k) / K`. Atlas cell size 128 px; one atlas PNG per model key.
- FgMainParam columns (hash names): item name `0x87BF00E8`, model `0x39B5A93D`, file `0x48EF0398`, colour index `0x64B8FFF8` (255 = none). Item id via `fieldItems[id].name` in `packages/core/src/generated/items.json`.
- BNTX formats (`format >> 8`): `0x1d` BC4, `0x1a` BC1, `0x0b` RGBA8, `0x1e` BC5 (not used). Ramps (`*_Grd`) are RGBA8; colour = `ramp[row][x = round(grey / 255 * (width - 1))]`; opacity cutoff: `_OP` value < 100 is transparent.
- Row choice: colour ramp (the ramp named `*Color00_Grd` or `*PetalColor_Grd`) uses the colour index; foliage ramps (leaf/body/stem/`Color01`) use the row with the greenest mid-grey colour (max of `g - max(r, b)`); trunk ramps row 0. Summer only.
- Skip: models whose name ends `Node` or `Anim` or contains `Snow`; materials with no textures (shadows). Weeds `A/B/C`: variant A.
- World units: 1 unit = 1 item tile; model instances use uniform scale `MODEL_SCALE` (initially `1 / 5`, calibrated in Task 8) at the footprint centre on the ground.
- No attribution lines in commits; any deviation from this plan is a `Ruling:` line in the commit body.
- Env: `export DOTNET_ROOT=~/.dotnet PATH=~/.dotnet:$PATH TMPDIR=$PWD/.superpowers/tmp`; tests `NHSE_TEST_ROMFS=$HOME/Games/ACNH/romfs NHSE_TEST_SAVE=$PWD/example-save-file bun test` (baseline 337) and `bunx playwright test` (baseline 9); clean TMPDIR copies by literal-path rm. Chrome note: the user's Chrome needs `--ozone-platform=x11` (already configured).

## Review Focus
- A model whose material lists a ramp or albedo texture that is missing from the BNTX: that model is skipped with a reason, the run continues (Task 5).
- An item whose name is in `fieldItems` but not in FgMainParam, or whose model/file is missing from the romfs: no manifest entry, counted in the report (Tasks 2, 5).
- A pack that is truncated, has a bad geometry magic or a missing texture: the browser reports "n models skipped" and still loads the rest (Task 6).
- Items with a model key whose geometry failed to load fall back to billboards instead of vanishing (Task 7).
- Re-running the generator gives byte-identical output (Task 5).

---

### Task 1: BC4 and RGBA8 texture decoding

**Files:** Modify `scripts/sprites/bntx.ts`; Test `tests/unit/spriteBntx.test.ts` (extend).

**Interfaces:**
- Produces: `decodeBc4(w: number, h: number, raw: Uint8Array): Uint8Array` (w*h bytes; both the 8-value and the 6-value-plus-0/255 modes); `type DecodedTexture = { width: number; height: number; channels: 1 | 4; data: Uint8Array }`; `decodeTexture(t: BntxTexture): DecodedTexture` (`0x1d` BC4 -> 1 channel, `0x1a` BC1 -> RGBA, `0x0b` RGBA8 deswizzled with bpp 4; anything else throws `unsupported format 0x…`).

- [ ] **Step 1:** Failing tests: BC4 block `a=255,b=0`, all indices 0 gives 255s and all indices 1 gives 0s; indices 2..7 give `(6a+b)/7 … (a+6b)/7` (8-value mode when `a > b`); with `a=0,b=255` (`a <= b`) index 6 is 0 and index 7 is 255; two blocks land at the right 4x4 positions; `decodeTexture` of a swizzled RGBA8 fixture (use `swizzle` from `tests/unit/spriteFixtures.ts` with bpp 4) round-trips; a format `0x1b01` throws.
- [ ] **Step 2:** Run `bun test tests/unit/spriteBntx.test.ts`; expect FAIL.
- [ ] **Step 3:** Implement (the spike's BC4 decoder logic: 48-bit index field, 3 bits per pixel).
- [ ] **Step 4:** Run; expect PASS. Commit `Models: BC4 and RGBA8 texture decoding`.

### Task 2: FgMainParam join

**Files:** Create `scripts/models/fgmain.ts`; Test `tests/unit/fgmain.test.ts`.

**Interfaces:**
- Produces: `type PlantRef = { file: string; model: string; colour: number | null }`; `parseFgMain(tsv: string): Map<string, PlantRef>` (keyed by item name; cells stripped of NUL/whitespace; colour 255 or non-numeric -> null; first row wins on duplicate names; throws naming the missing column if a needed header is absent); `joinFieldItems(fg: Map<string, PlantRef>, fieldItems: Record<string, { name: string }>): { items: Map<number, PlantRef>; unmapped: number[] }` (ids whose name is not in `fg`).

- [ ] **Step 1:** Failing tests on a synthetic TSV (header row of hash names; NUL-padded cells; rows for `PltTreeOak4` file `PltTreeOak` model `PltTreeOak4` colour 255, `PltFlwCosmos3Red` colour 2, a duplicate, a short row): colours, null for 255, duplicate first-wins, missing header throws; `joinFieldItems` maps `"60000": {name:"PltTreeOak4"}` to id 60000 and lists an unknown name in `unmapped`.
- [ ] **Step 2:** Run; expect FAIL. Implement; expect PASS. Commit `Models: FgMainParam join`.

### Task 3: BFRES models dump (C# helper + TS wrapper)

**Files:** Modify `scripts/sprites/dotnet/Program.cs`; Create `scripts/models/plantFile.ts`; Test `tests/unit/plantFile.test.ts` (gated on `NHSE_TEST_ROMFS`).

**Interfaces:**
- Produces (C#): command `bfres-models <in.bfres> <outDir>` writes `outDir/models.json` = `{ models: [{ name, materials: [{ name, textures: string[] }], shapes: [{ name, mat, skin, pos, nrm, uv, idx }] }] }` (all models, LOD 0, `skin` = vertex skin count, `textures` = the material's `TextureRefs` names) plus every embedded file (`textures.bntx`).
- Produces (TS): `type DumpedModel = { name: string; materials: { name: string; textures: string[] }[]; shapes: { name: string; mat: string; skin: number; pos: number[]; nrm: number[]; uv: number[]; idx: number[] }[] }`; `loadPlantFile(romfs: string, file: string): Promise<{ models: DumpedModel[]; textures: BntxTexture[] }>` (zstd -> SARC -> `.bfres` -> helper -> read `models.json` and `textures.bntx`; temp dir removed).

- [ ] **Step 1:** Failing gated test: `loadPlantFile(ROMFS, "PltFlwCosmos")` returns models named `PltFlwCosmos0`, `PltFlwCosmos1`, `PltFlwCosmos2`, `PltFlwCosmosSeedling`; `PltFlwCosmos2` has materials `mCosmosFlower` (textures include `mCosmosColor00_Grd`) and `mCosmosBody` (`mCosmosColor01_Grd`); every shape has `pos.length === nrm.length` and a multiple of 3; the BNTX contains `mCosmosFlower_AlbGry`.
- [ ] **Step 2:** Run with `NHSE_TEST_ROMFS` set; expect FAIL. Implement the C# command (reuse the existing `bfres` command's vertex-buffer code; add `_n0`) and `plantFile.ts`; `dotnet build scripts/sprites/dotnet -c Release`.
- [ ] **Step 3:** Run; expect PASS. Commit `Models: BFRES models dump`.

### Task 4: Pack format and texture baking

**Files:** Create `app/src/map3d/modelFormat.ts`, `scripts/models/bake.ts`; Test `tests/unit/modelFormat.test.ts`, `tests/unit/bake.test.ts`.

**Interfaces:**
- Produces (`modelFormat.ts`, pure, no DOM): `type Geometry = { positions: Float32Array; normals: Float32Array; uvs: Float32Array; indices: Uint32Array }`; `type Manifest = { version: 1; items: Record<string, string>; models: Record<string, { geometry: string; texture: string }> }`; `encodeGeometry(g: Geometry): Uint8Array`; `decodeGeometry(b: Uint8Array): Geometry` (throws on bad magic, truncated data, or index out of range); `parseManifest(json: string): Manifest` (throws unless version 1 and well-formed).
- Produces (`bake.ts`): `type Grey = { width: number; height: number; data: Uint8Array }`; `type Ramp = { width: number; height: number; data: Uint8Array /* RGBA */ }`; `pickRow(ramp: Ramp, kind: "colour" | "foliage" | "trunk", colour: number | null): number`; `bakeCell(albedo: Grey | null, opacity: Grey | null, ramp: Ramp | null, row: number, size: number): Uint8Array` (RGBA size x size, nearest sampling; no ramp -> grey; no albedo -> grey 128; alpha 0 where opacity < 100 else 255); `atlas(cells: Uint8Array[], size: number): { width: number; height: number; data: Uint8Array }` (cells side by side).

- [ ] **Step 1:** Failing tests: geometry round-trips; a truncated file, a wrong magic and an index >= vertexCount are rejected; `parseManifest` rejects version 2 and missing keys. Bake: a 2x2 ramp with known colours gives the expected cell colour for grey 0 and 255 at row 0 and row 1; opacity 99 is transparent and 100 opaque; `pickRow(...,"foliage")` returns the greenest row of a 3-row ramp, `"trunk"` returns 0, `"colour"` returns the given colour clamped to the last row (null -> 0); `atlas` of two 4x4 cells has width 8 and keeps cell order.
- [ ] **Step 2:** Run; expect FAIL. Implement; expect PASS. Commit `Models: pack format and texture baking`.

### Task 5: Generator, CLI and report

**Files:** Create `scripts/models/generate.ts`, `scripts/models/cli.ts`; Modify `package.json` (`"gen:models": "bun scripts/models/cli.ts"`), `.gitignore`; Test `tests/unit/generate.test.ts` (fake source), `tests/golden/modelsRomfs.test.ts` (gated).

**Interfaces:**
- Consumes: Tasks 1-4; `loadPlantFile`, `runHelper`, `parseItemParam` is not needed.
- Produces: `type ModelSource = { fgMain(): Promise<Map<string, PlantRef>>; plant(file: string): Promise<{ models: DumpedModel[]; textures: BntxTexture[] } | null> }`; `generateModels(opts: { out: string; only?: string }, fieldItems: Record<string, { name: string }>, src: ModelSource): Promise<Report>` with `Report = { models: number; textures: number; items: number; skipped: number; reasons: Record<string, number>; entries: Record<string, string> }`, writes `<out>/models.json`, `<out>/geo/<model>.bin`, `<out>/tex/<file>_<model>_<colour>.png`, and `<out>.report.json` (outside the folder); `openRomfsModels(romfs: string): Promise<ModelSource>` (reads `Bcsv/FgMainParam.bcsv` through the helper, caches parsed plant files, rejects with `not a romfs dump` when files are missing).
- Rules: skip `Node`/`Anim`/`Snow` models and untextured materials; per model shapes are remapped to the atlas (materials sorted by name; cells use the material's `_AlbGry`, `_OP` and its `*_Grd` ramp from its texture list; missing albedo or ramp = skip model with reason `missing texture <name>`); row per material by the Global Constraints; `--only <name|id>` filters items by name or id; output is deterministic (sorted keys, no timestamps).

- [ ] **Step 1:** Failing unit tests with a fake `ModelSource` (one synthetic plant with two materials, BC4/RGBA8 BNTX fixtures from `spriteFixtures.ts`): the manifest maps item ids to keys, geometry decodes, UVs lie inside their atlas cell, the atlas PNG has K cells, a `Node` model and a shadow material are skipped, a missing ramp skips only that model with its reason, an unmapped item name is counted, a second run produces identical bytes. Gated golden: generate `--only PltTreeOak4` and `PltFlwCosmos3Red` into a temp dir; assert manifest ids 60000.. exist for the oak, vertex counts > 0, the oak texture PNG is not uniform, the cosmos red key ends `@2`.
- [ ] **Step 2:** Run; expect FAIL. Implement `generate.ts` and `cli.ts` (same flags style as `gen:sprites`; exit 1 with a message on a bad romfs); add `personal-models/` and `personal-models.report.json` to `.gitignore`.
- [ ] **Step 3:** Run unit and gated tests; expect PASS. Commit `Models: generator and gen:models CLI`.

### Task 6: Browser pack import and store

**Files:** Create `app/src/map3d/modelPack.ts`; Modify `app/src/map/spritePack.ts` (`createPackStore(idb, key = "pack")`), `app/src/sections/map/MapSection.svelte`; Test `tests/unit/modelPack.test.ts`.

**Interfaces:**
- Produces: `isModelPack(files: { name: string; data: Uint8Array }[]): boolean` (a file whose basename is `models.json`); `parseModelPack(files): { items: Map<number, string>; models: Map<string, { geometry: Geometry; texture: Uint8Array /* PNG */ }>; skipped: number }` (paths matched by manifest-relative name regardless of leading folder; any model with a missing/corrupt geometry or missing texture is skipped and counted); `modelPackStore: PackStore` (same IndexedDB, key `"models"`, stores the raw files map); in `MapSection`: `onpick` routes a pack containing `models.json` to the model path, stores raw files, builds the in-memory pack, toasts `Imported n models (m skipped)`, status text `models: n loaded` (`data-testid="model-status"`), and **Clear** removes both packs; the pack is restored from the store on mount; `MapView3D` receives `models` (can be null).

- [ ] **Step 1:** Failing tests: `isModelPack` true for `personal-models/models.json`, false for sprite file lists; `parseModelPack` over a small in-test pack (built with the Task 4 encoders) returns the items and models; a pack with one truncated geometry file and one missing texture reports `skipped: 2` and still returns the good model; a zip-style flat path list and a folder-prefixed list both parse; the store's in-memory fallback round-trips when `indexedDB` is undefined (as `spritePack` tests do).
- [ ] **Step 2:** Run; expect FAIL. Implement; `bun run typecheck`; expect PASS. Commit `Models: browser pack import and store`.

### Task 7: Draw models in 3D

**Files:** Modify `app/src/map3d/itemGroups.ts`, `app/src/map3d/scene3d.ts`, `app/src/map3d/MapView3D.svelte`, `app/src/map3d/constants.ts`, `app/src/sections/map/MapSection.svelte`; Test `tests/unit/itemGroups.test.ts` (extend).

**Interfaces:**
- Produces: `groupItems(map, f, sprites, modelKeyOf?: (id: number) => string | null)` additionally returns `models: Map<string, Instance[]>`; an item whose id has a key goes only there (not in `flat`/`upright`); `MODEL_SCALE = 1 / 5` in `constants.ts`; `Scene3D.setModels(pack: LoadedModels | null): void` where `LoadedModels = { items: Map<number, string>; models: Map<string, { geometry: Geometry; texture: Uint8Array }> }`; the scene builds one `BufferGeometry` per model geometry, one `CanvasTexture`-free `TextureLoader`/blob URL texture per key (nearest filtering, sRGB), one `InstancedMesh` per key and layer (`MeshLambertMaterial({ map, alphaTest: 0.5, side: DoubleSide })`), instance transform = translate (x, y, z) * uniform `MODEL_SCALE`; a key whose geometry or texture fails stays out of `models` and its items fall back to billboards (keyOf returns null for it); layers visibility via `userData.layer` as the billboards.

- [ ] **Step 1:** Failing tests: with `modelKeyOf` returning `"M@1"` for a chair id, `groupItems` puts its instance in `models["M@1"]` with the footprint centre and ground height and nothing in `flat`/`upright`; an id with `null` still goes to the billboard groups; instances carry `tile` and `layer`.
- [ ] **Step 2:** Run; expect FAIL. Implement grouping, scene drawing, the `MapView3D` `models` prop and the `MapSection` wiring (`setModels` effect; refresh items after it changes); `bun run typecheck && bun run build`.
- [ ] **Step 3:** Run unit tests; expect PASS. Commit `Models: draw models in the 3D view`.

### Task 8: End-to-end, calibration, measurement, handoff

**Files:** Create `tests/e2e/map3dModels.spec.ts`; Modify `app/src/map3d/constants.ts` (`MODEL_SCALE`, any orientation fix), `scripts/models/*` (row tuning if needed), `docs/superpowers/HANDOFF.md`.

- [ ] **Step 1:** Run the full export: `bun run gen:models --romfs ~/Games/ACNH/romfs`; record counts, skipped reasons, wall time and the pack size (`du -sh personal-models`).
- [ ] **Step 2:** Gated e2e (`NHSE_TEST_ROMFS` and `NHSE_TEST_SAVE`): generate a small pack (oak and cosmos only) into a temp dir, zip it, open the example save, 3D, screenshot, import the zip, expect `model-status` to show models and the screenshot to differ; Clear restores the original picture.
- [ ] **Step 3:** Calibrate by eye with screenshots of the example island (close-ups of an oak, a fruit tree, cosmos in several colours, an azalea bush, weeds, a stump): fix `MODEL_SCALE`, model facing/orientation and the foliage/colour row rules until trees, flowers and bushes look right and colour variants differ correctly (white vs pink azalea, red vs white cosmos); record each change as a `Ruling:`; show the user the screenshots.
- [ ] **Step 3b:** Measure item drawing performance (orbit and a terrain edit on the example island with models loaded); if the instanced meshes make orbiting visibly slow, record it and propose reductions (distance cull or lower stage LOD) as a deferred item.
- [ ] **Step 4:** Full suites: `NHSE_TEST_ROMFS=$HOME/Games/ACNH/romfs NHSE_TEST_SAVE=$PWD/example-save-file bun test`, `bunx playwright test`, `bun run typecheck`, `bun run build`; expect all green. Clean TMPDIR copies.
- [ ] **Step 5:** Update HANDOFF.md (models: commands, pack format, row rules, constants, measurements, known gaps: fixed summer, no seasons/snow/animation/fruit, variant A weeds, no model picking, fences/rocks/shells not covered) and commit `Models: e2e, calibration and handoff`. Do not push; report all `Ruling:` lines.
