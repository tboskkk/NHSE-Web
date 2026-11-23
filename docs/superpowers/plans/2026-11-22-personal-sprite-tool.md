# Personal Sprite Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `bun run gen:sprites --romfs <dir>` renders every `Ftr*` item that has `ReBody` variants into `personal-sprites/NNNNN_V.png` (top-down, albedo-only), which the Map page's `importPack` accepts.

**Architecture:** TS pipeline in `scripts/sprites/` (container, BNTX, rasteriser, PNG, orchestration, CLI). One small C# helper (`scripts/sprites/dotnet/`) does the two formats we do not port: BCSV (via vendored `NHSE.Parsing` `BCSVConverter.Dump`) and BFRES (via BfresLibrary 1.6.0). Per-item failures are recorded in `report.json`, never fatal.

**Tech Stack:** bun (`Bun.zstdDecompressSync`, `node:zlib`), TypeScript strict, .NET 10 (already in `~/.dotnet`), `bun test`.

**Spec:** `docs/superpowers/specs/2026-11-22-personal-sprite-tool-design.md` (reference code: `scripts/spike-s/`).

## Global Constraints
- Never commit Nintendo art, romfs bytes or output: fixtures are built in-test; `personal-sprites/` stays git-ignored.
- Sprite = RGBA PNG named `NNNNN_V.png` (5-digit zero-padded id, decimal variant); canvas = footprint `w x h` (from `@nhse/core` `itemFootprint(BigInt(id))`, tile units) at 32 px per unit; albedo texture = first BNTX texture whose name ends `_Alb`; BC1 only; render orientation 0, no lighting.
- Model larger than its footprint is scaled down uniformly to fit, never up; centred; transparent background.
- `unknownSize` items: canvas = model bounding box rounded up to whole tiles.
- Env for every command: `export DOTNET_ROOT=~/.dotnet PATH=~/.dotnet:$PATH TMPDIR=$PWD/.superpowers/tmp`.
- Commits: no attribution lines; any deviation from this plan is a `Ruling:` line in the commit body.

## Review Focus
- Model with several `_Alb` textures: first is used, report counts it (Task 5).
- Item whose variant has no `ReBody` file or whose texture is not BC1: skipped with a reason, run continues (Task 5).
- Empty mesh / zero-area bounding box: skipped, no NaN scale or crash (Task 3).
- Rerun with existing outputs: nothing re-rendered, report still complete (Task 5).
- Unreadable romfs or helper not built: non-zero exit with a clear message (Task 5).

---

### Task 1: Containers and PNG

**Files:** Create `scripts/sprites/container.ts`, `scripts/sprites/png.ts`; Test `tests/unit/spriteContainer.test.ts`, `tests/unit/spritePng.test.ts`.

**Interfaces:**
- Produces: `readSarc(data: Uint8Array): Map<string, Uint8Array>`; `unzs(data: Uint8Array): Uint8Array`; `encodePng(w: number, h: number, rgba: Uint8Array): Uint8Array`; test helper `buildSarc(files: Record<string, Uint8Array>): Uint8Array` in `tests/unit/spriteFixtures.ts` (little-endian SARC with SFAT/SFNT, as the spike's reader parses).

- [ ] **Step 1:** Write failing tests: `readSarc(buildSarc({"a.bfres": [1,2,3], "dir/b.bntx": [9]}))` returns both names and bytes; `unzs(Bun.zstdCompressSync(x))` equals `x`; `readSarc` throws on bad magic; `encodePng(2,1,[255,0,0,255, 0,0,255,128])` starts with PNG magic, and `importPack([{name:"00001_0.png", data}])` from `app/src/map/spritePack` accepts it; decoding it back with `Bun.decodeImage` is not available, so assert IHDR width/height bytes and that inflating the IDAT payload (filter byte 0 per row) returns the input pixels.
- [ ] **Step 2:** Run `bun test tests/unit/spriteContainer.test.ts tests/unit/spritePng.test.ts`; expect FAIL (modules missing).
- [ ] **Step 3:** Implement per the spike's `sarc.py` (SFAT 16-byte entries, name offset `& 0xffffff` words, data offset at header+0x0c; endianness from BOM) and `encodePng` (IHDR 8-bit RGBA, one IDAT via `zlib.deflateSync`, CRC32 via `zlib.crc32`).
- [ ] **Step 4:** Run the two tests; expect PASS.
- [ ] **Step 5:** `git add scripts/sprites tests/unit && git commit -m "Sprites: zstd/SARC readers and PNG encoder"`

### Task 2: BNTX decode

**Files:** Create `scripts/sprites/bntx.ts`; Test `tests/unit/spriteBntx.test.ts`; extend `tests/unit/spriteFixtures.ts`.

**Interfaces:**
- Produces: `parseBntx(data: Uint8Array): BntxTexture[]` with `BntxTexture = {name: string; format: number; width: number; height: number; blockHeightLog2: number; data: Uint8Array}`; `deswizzle(wBlocks: number, hBlocks: number, bytesPerBlock: number, blockHeightLog2: number, data: Uint8Array): Uint8Array`; `decodeBc1(w: number, h: number, raw: Uint8Array): Uint8Array` (RGBA, 3-colour mode alpha 0); `albedo(textures: BntxTexture[]): {rgba: Uint8Array; width: number; height: number; albCount: number}` (first name ending `_Alb`, throws `unsupported format 0x…` unless `format >> 8 === 0x1a`).
- Test helper: `swizzle(...)` in fixtures, an independent inverse of the Tegra formula written from the spec of the layout (not copied from `deswizzle`), and `buildBntx(textures)` writing the header fields the spike reads (`BNTX`, `NX  ` at 0x20, count 0x24, info ptr 0x28, BRTI fields at the spike's offsets).

- [ ] **Step 1:** Failing tests: BC1 block with c0=0xF800, c1=0x001F, all-index-0 decodes to red pixels; c0<c1 index 3 gives alpha 0; `deswizzle(swizzle(x)) == x` for 64x64-block-sized random data at blockHeightLog2 0..4; `parseBntx(buildBntx([...]))` round-trips names/sizes; `albedo` picks `X_Alb` over `X_Nrm` and reports `albCount`; `albedo` throws on a non-BC1 format.
- [ ] **Step 2:** Run `bun test tests/unit/spriteBntx.test.ts`; expect FAIL.
- [ ] **Step 3:** Implement from `scripts/spike-s/bntx.py` and `render.py` (`deswizzle`, `decode_bc1`); same offsets and formula, typed arrays instead of numpy.
- [ ] **Step 4:** Run; expect PASS.
- [ ] **Step 5:** Commit `Sprites: BNTX parsing and BC1 decode`.

### Task 3: Rasteriser

**Files:** Create `scripts/sprites/raster.ts`; Test `tests/unit/spriteRaster.test.ts`.

**Interfaces:**
- Consumes: `albedo()` output shape `{rgba, width, height}`.
- Produces: `type Shape = {pos: number[]; uv: number[]; idx: number[]}` (flat xyz floats, uv as u16/65535 floats, triangle indices); `modelBounds(shapes: Shape[]): {minX, maxX, minZ, maxZ} | null` (null if no vertices); `renderTop(shapes: Shape[], tex: {rgba, width, height}, canvas: {w: number; h: number}, pxPerUnit: number): Uint8Array | null` (RGBA `w*32` x `h*32` is the caller's choice: `canvas` is already in pixels); `UNITS_PER_TILE: number` (model units per footprint tile; initial value 1, calibrated in Task 5).
- Top-down mapping as the spike: screen x = model x, screen y = model z, nearer = larger model y.

- [ ] **Step 1:** Failing tests with a hand-made quad (two triangles) and a 2x2 texture: covers expected pixel area, centred in the canvas; a higher quad (larger y) overdraws a lower one; model wider than the canvas is scaled down to fit and a smaller one keeps its pixel scale; `renderTop([], …)` and a zero-extent mesh return null; UV orientation: texel (0,0) lands at the quad's uv (0,0) corner.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Implement the barycentric z-buffer as in the spike's `raster`, with scale = `min(1, canvasPx / modelPx) * pxPerUnit`; nearest-neighbour sampling.
- [ ] **Step 4:** Run; expect PASS.
- [ ] **Step 5:** Commit `Sprites: top-down rasteriser`.

### Task 4: .NET helper and ItemParam

**Files:** Create `scripts/sprites/dotnet/sprites-helper.csproj`, `scripts/sprites/dotnet/Program.cs`, `scripts/sprites/helper.ts`, `scripts/sprites/itemParam.ts`; Test `tests/unit/spriteItemParam.test.ts`, `tests/unit/spriteHelper.test.ts` (gated on `NHSE_TEST_ROMFS`).

**Interfaces:**
- Produces: C# commands `bcsv <in.bcsv> <out.tsv>` (calls `NHSE.Parsing.BCSVConverter.Dump`, as `spike-s/bcsv/d`) and `bfres <in.bfres> <outDir>` (writes `model.json` = `{shapes:[{name, mat, pos, uv, idx}]}` flattened across models, and any external files, as `spike-s/bf/bf`); `runHelper(args: string[]): Promise<void>` (runs the built dll via `dotnet`, throws with stderr; throws `helper not built: run dotnet build scripts/sprites/dotnet -c Release` if missing); `parseItemParam(tsv: string, modelExists: (name: string) => boolean): {id: number; model: string}[]`: id column is header `0x54706054`; model = first cell in column order matching `^Ftr[A-Za-z0-9]+$` for which `modelExists` is true (cells stripped of `\0` and whitespace); rows without both are dropped; ids deduplicated first-wins.

- [ ] **Step 1:** Failing tests: `parseItemParam` over a synthetic TSV (header row of hash names, rows with NUL-padded cells, a row with no Ftr cell, a row whose Ftr model does not exist, a duplicate id) returns the expected list. Gated test: `runHelper(["bcsv", ItemParam, out])` then `parseItemParam` yields id 770 → `FtrWireChairS`.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Port the two spike projects into one csproj (net10.0, `PackageReference BfresLibrary 1.6.0`, `ProjectReference ../../../vendor/NHSE/NHSE.Parsing/NHSE.Parsing.csproj`); implement `helper.ts` and `itemParam.ts`. Add `scripts/sprites/dotnet/bin/` and `obj/` to `.gitignore`.
- [ ] **Step 4:** `dotnet build scripts/sprites/dotnet -c Release`, then `NHSE_TEST_ROMFS=$HOME/Games/ACNH/romfs bun test tests/unit/spriteItemParam.test.ts tests/unit/spriteHelper.test.ts`; expect PASS.
- [ ] **Step 5:** Commit `Sprites: .NET helper for BCSV/BFRES and ItemParam reader` with `Ruling: BCSV parsing stays in the C# helper (spec said TS); the format is hashed-header and already solved by vendored NHSE.Parsing`.

### Task 5: Pipeline, CLI, report, calibration

**Files:** Create `scripts/sprites/render.ts`, `scripts/sprites/cli.ts`; Modify `package.json` (`"gen:sprites": "bun scripts/sprites/cli.ts"`), `.gitignore`; Test `tests/unit/spriteRender.test.ts` (injected fakes), `tests/golden/spritesRomfs.test.ts` (gated on `NHSE_TEST_ROMFS`).

**Interfaces:**
- Consumes: Tasks 1-4.
- Produces: `renderVariant(deps: {loadModel(name): Promise<Shape[]>; loadTextures(name, v): Promise<BntxTexture[]>}, item: {id: number; model: string}, variant: number): Promise<{png: Uint8Array; albCount: number}>` (throws `Error` with a short reason: `no mesh`, `unsupported format 0x…`, `no _Alb texture`); `variantsOf(romfs: string, model: string): number[]` (sorted V from existing `Model/<model>ReBody<V>.Nin_NX_NVN.zs`); `runAll(opts: {romfs: string; out: string; only?: string; jobs: number}): Promise<Report>` with `Report = {rendered: number; skipped: number; multiAlb: number; reasons: Record<string, number>; items: Record<string, string>}` written to `<out>/report.json`; skips files that already exist (counted as rendered-before, not re-rendered); CLI parses `--romfs --out --only --jobs` and exits 1 with a message if romfs/ItemParam is missing or the helper is not built.

- [ ] **Step 1:** Failing unit tests with fake deps: footprint canvas size = `w*32` x `h*32` for a known id; unknownSize id uses bbox; a mesh-less model throws `no mesh`; two `_Alb` textures → `albCount` 2. `runAll` with injected deps: a failing item lands in `reasons` and the others still render; second run writes nothing new; missing romfs rejects with the message. Gated golden test: render `--only FtrWireChairS` variant 3 to a temp dir; PNG dimensions match the footprint, alpha coverage > 0, `parsePackName`/`importPack` accept it.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Implement. Per-model work: unzs → readSarc → find the `.bfres` entry → `runHelper(["bfres", …])` into a temp dir; textures from `<model>ReBody<V>` through the same path, reading the `.bntx` entry; bounded concurrency `--jobs` (default 4). Cache each base model's shapes across its variants.
- [ ] **Step 4:** Calibrate `UNITS_PER_TILE`: render the 8 spike chairs with candidate values, choose the one at which a chair fills about its 2x2 footprint without the fit-down kicking in, record the value and reasoning in a code comment. Run unit tests and the gated golden test; expect PASS.
- [ ] **Step 5:** Commit `Sprites: render pipeline and gen:sprites CLI` (Ruling line for the calibrated value).

### Task 6: Full run, verification, cleanup

**Files:** Modify `docs/superpowers/HANDOFF.md`; Delete `scripts/spike-s/`.

- [ ] **Step 1:** `bun run gen:sprites --romfs ~/Games/ACNH/romfs` (background, `--jobs` 4); record rendered/skipped/reasons and wall time from `report.json`.
- [ ] **Step 2:** Build a contact sheet of ~30 random outputs (chairs, tables, beds, a large item) into the scratchpad with a throwaway script; open it and judge recognisability and relative scale. If wrong, fix via a failing test first, then rerun.
- [ ] **Step 3:** Load the Map page in a browser (`bun run build` preview), import `personal-sprites/`, confirm zero skipped and that a chair, a bed and a table draw at plausible sizes.
- [ ] **Step 4:** `NHSE_TEST_SAVE=$PWD/example-save-file bun test` (expect all passing, count up by the new tests), `bun run typecheck`; clean the 23 MB TMPDIR copies by literal-path rm.
- [ ] **Step 5:** `git rm -r scripts/spike-s`, update HANDOFF.md (tool usage, report numbers, known gaps from the spec), commit `Sprites: remove spike S, update handoff`. Report all `Ruling:` lines to the user. Do not push.
