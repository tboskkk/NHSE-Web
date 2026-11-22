# Map Viewer (P1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A read-only island map viewer (terrain, field items, buildings, acres) on a PixiJS WebGL canvas with zoom/pan, hover inspector, layer toggles and sprite-pack import.

**Architecture:** New map structures in `packages/core` are verified byte-identical against upstream `NHSE.Core` through new C# oracle commands. The worker exposes `api.map()` returning transferable typed arrays. A PixiJS renderer in `app/src/map/` consumes only those arrays and a `SpriteSource`. Pure logic (camera, tile math, palette, sprite lookup) is separated from the Pixi scene so it is unit-testable.

**Tech Stack:** TypeScript strict, Bun test, Svelte 5, Vite, PixiJS v8 (exact version pinned at Task 8), C# reference CLI (.NET 10), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-22-map-viewer-design.md` (read it first; also `docs/superpowers/HANDOFF.md` for architecture rules).

## Global Constraints

- Core stays pure TS (no DOM); every new save structure gets an oracle command and a golden test **before** other code depends on it.
- Map is read-only in P1: no `EditOp`, no dirty state, nothing written to the save.
- Only the 3.0.3 example save is a verified revision; dimensions/offsets come from the per-revision table, never hard-coded constants (field item acres: 7 wide before 3.0.0, 9 from 3.0.0; height always 6).
- Terrain: 7×6 interior acres × 16×16 tiles, 14-byte `TerrainTile`, column-major (`index = totalHeight*x + y`). Items: 32×32 tiles per acre, 8-byte `Item`, two layers column-major; flag bitmaps row-major (`y*width + x`). Buildings: 46 × 0x14 bytes. Acre layout: 9×8 u16 at `OutsideField`.
- Ocean color `0xFF80D7C3`. Sprite lookup order: `id_count` → `id_0` → bundled menu icon → `app/public/sprites/leaf.png`. Sprite pack naming `NNNNN_V.png`.
- Never commit `example-save-file/` or any Nintendo sprite pack; sprite packs live only in git-ignored `personal-sprites/` (add to `.gitignore`).
- Every plan deviation is recorded as a `Ruling:` line in the ledger (`docs/superpowers/plans/2026-11-22-map-viewer-ledger.md`). TDD: watch each test fail first.
- Env: `export DOTNET_ROOT=~/.dotnet PATH=~/.dotnet:$PATH`; after C# edits run `dotnet build reference -c Release`; tests: `NHSE_TEST_SAVE=$PWD/example-save-file bun test`.

## Review Focus

- Save with all-empty field item layers / no buildings: viewer renders ocean+terrain, inspector says "nothing here", no crash (Task 3, 10).
- Pre-3.0.0 revision (7-acre-wide item grid): dimensions come from the revision table, tile math still correct (Task 3 synthetic-dimension unit test).
- Hover/click outside the island or on the deep-sea border: inspector shows nothing, no exception (Task 6).
- Item ID with no catalog name or sprite: falls back to leaf icon, hover still shows raw id (Task 8, 10).
- Malformed/duplicate/non-PNG files in an imported sprite pack: skipped with a count, valid ones still load (Task 8).
- Extreme zoom/pan and window resize: camera stays clamped, no NaN transforms (Task 6).
- Loading a different save while the Map is open: scene is rebuilt, no stale data (Task 10).

---

## File Structure

- `reference/Commands/ExportData.cs` (modify): per-revision `mainOffsets`; field-item remap table.
- `reference/Commands/MapDump.cs` (create) + `reference/Program.cs` (modify): `map` command.
- `packages/core/src/save/revisions.ts` (modify): `Revision.mainOffsets`.
- `packages/core/src/map/` (create): `terrainTile.ts`, `building.ts`, `mapData.ts` (readMap), `fieldItems.ts` (remap), index export via `packages/core/src/index.ts`.
- `app/src/worker/{protocol,handlers}.ts` (modify): `map()`.
- `app/src/map/` (create): `camera.ts`, `tiles.ts`, `terrainPalette.ts`, `terrainImage.ts`, `spriteSource.ts`, `spritePack.ts`, `scene.ts`, `MapView.svelte`, `Inspector.svelte`.
- `app/src/sections/map/MapSection.svelte` (create); `Sidebar.svelte`, `App.svelte`, `state.svelte.ts` (modify).
- Tests: `tests/golden/{mainOffsets,map,fieldItems}.test.ts`, `tests/unit/{camera,tiles,terrainImage,spriteSource,spritePack}.test.ts`, `tests/e2e/map.spec.ts`.

---

### Task 1: Per-revision main offsets via oracle

**Files:** Modify `reference/Commands/ExportData.cs`, `packages/core/src/save/revisions.ts`, regenerate `packages/core/src/generated/revisions.json` (`bun run gen:data`); Test `tests/golden/mainOffsets.test.ts`, `tests/unit/generated.test.ts`.

**Interfaces:**
- Produces: `Revision.mainOffsets: { fieldItem: number; landMakingMap: number; mainFieldStructure: number; outsideField: number; fieldItemAcreWidth: number }` (one entry per revision in `REVISIONS`).

- [ ] **Step 1: Write failing tests.** Unit (`generated.test.ts`): every revision has `mainOffsets` with all five numeric fields; revision 34 (3.0.3) has `fieldItemAcreWidth === 9`, revisions 0–30 have 7. Golden: for the example save, `sav.revision.mainOffsets` equals values printed by `dump` of upstream `MainSaveOffsets` (extend `Dump.cs` summary with `mainOffsets` for the loaded save).
- [ ] **Step 2: Run, verify they fail** (`bun test tests/unit/generated.test.ts tests/golden/mainOffsets.test.ts`; expected: missing property).
- [ ] **Step 3: Implement.** In `ExportData.Revisions()` add `mainOffsets` using `MainSaveOffsets.GetOffsets(header)` (same pattern as `PersonalOffsets.GetOffsets`); add the field to the `Revision` type; add `mainOffsets` to the `dump` summary. Run `dotnet build reference -c Release` then `bun run gen:data`.
- [ ] **Step 4: Run tests, verify pass**; `bun run typecheck`.
- [ ] **Step 5: Commit** `git commit -m "Export per-revision main save offsets"`.

### Task 2: Oracle `map` command

**Files:** Create `reference/Commands/MapDump.cs`; Modify `reference/Program.cs`, `reference/README.md`.

**Interfaces:**
- Produces: CLI `reference map <saveDir> <outFile.json>` writing `{ terrain: {width,height,tiles:[{unitModel,variation,angle,roadModel,roadVariation,roadAngle,elevation}]}, items: {width,height,layer0:[hex16...],layer1:[hex16...],flag0:[0|1...],flag1:[0|1...]}, buildings:[{type,x,y,angle,bit,subType,typeArg,uniqueId}], acres:[u16...], plaza:{x,z} }`. Tiles are emitted in the upstream **flat array order**; flags are emitted per `GetIsActive(x,y)` in column-major order of (x,y) so the TS side can compare through its own indexing.

- [ ] **Step 1:** Add the `map` case to `Program.cs` and usage text; implement `MapDump.Run` using `HorizonSave.FromFolder`, `MainSave.GetTerrainTiles/GetFieldItemLayer0/1/Buildings/GetAcreBytes`, `LayerItemFlag` accessors, and the `EventPlazaLeftUpX/Z` properties.
- [ ] **Step 2:** `dotnet build reference -c Release`; run `dotnet run --no-build -c Release --project reference -- map example-save-file /tmp/map.json`; expected: file written, terrain 10752 tiles (112×96), item layers 55296 each (288×192) for 3.0.3. Record any mismatch as a `Ruling:`.
- [ ] **Step 3: Resolve alignment (spec §2 open point).** From the dump, determine how the 7×6 terrain grid and the 9×6 item grid align in world space (check where buildings/plaza fall against terrain land vs ocean; inspect `MapEditor`/`TerrainSprite` in `vendor/NHSE`). Write the finding (offset in item tiles, building/plaza coordinate units) at the top of `docs/superpowers/plans/2026-11-22-map-viewer-ledger.md` as `Ruling:` lines; Tasks 3, 6, 7, 9 use it.
- [ ] **Step 4: Commit** `git commit -m "Oracle: map dump command"`.

### Task 3: Core map structures (golden)

**Files:** Create `packages/core/src/map/{terrainTile,building,mapData}.ts`; Modify `packages/core/src/index.ts`; Test `tests/golden/map.test.ts`, `tests/unit/mapData.test.ts`.

**Interfaces:**
- Consumes: `Revision.mainOffsets` (Task 1), `HorizonSave.main.data` (`Uint8Array`), `Item.read` from `structures/item.ts`.
- Produces:
  ```ts
  type TerrainLayer = { width: number; height: number; unitModel: Uint16Array; variation: Uint16Array; angle: Uint16Array;
    roadModel: Uint16Array; roadVariation: Uint16Array; roadAngle: Uint16Array; elevation: Uint16Array }; // length width*height, column-major
  type ItemLayer = { width: number; height: number; raw: BigUint64Array; flags: Uint8Array }; // raw column-major; flags index y*width+x, one byte per tile (0|1)
  type BuildingInfo = { type: number; x: number; y: number; angle: number; bit: number; subType: number; typeArg: number; uniqueId: number };
  type MapData = { terrain: TerrainLayer; items: [ItemLayer, ItemLayer]; buildings: BuildingInfo[]; acres: Uint16Array; acreWidth: 9; acreHeight: 8; plaza: { x: number; z: number } };
  function readMap(main: Uint8Array, rev: Revision): MapData;
  function tileIndex(totalHeight: number, x: number, y: number): number; // totalHeight*x + y
  ```
- [ ] **Step 1: Write failing golden test** `map reads match upstream`: run `reference map`, call `readMap` on the loaded save, assert terrain fields, both item layers (`raw` as 16-digit hex), unpacked flags (via `tileIndex`/row-major index), buildings, acres and plaza all equal the oracle JSON.
- [ ] **Step 2: Write failing unit tests:** `tileIndex(96, 2, 5) === 197`; `readMap` on a synthetic buffer with a 7-acre-wide revision stub returns item layers of `224*192` tiles; empty buildings (`type 0`) are still returned (46 entries); a buffer shorter than the layout throws `RangeError`.
- [ ] **Step 3: Run, verify fail.**
- [ ] **Step 4: Implement** `readMap` and the structure readers; dimensions from `rev.mainOffsets.fieldItemAcreWidth`; unpack flag bits LSB-first as upstream `FlagUtil.GetFlag` (verify against `vendor/NHSE/NHSE.Core/Util/FlagUtil.cs`).
- [ ] **Step 5: Run `bun test`, verify pass** (81 existing + new); typecheck.
- [ ] **Step 6: Commit** `git commit -m "Core: terrain, field item, building and acre readers (oracle-verified)"`.

### Task 4: Field item remap (golden)

**Files:** Modify `reference/Commands/ExportData.cs`; Create `packages/core/src/map/fieldItems.ts`, generated `packages/core/src/generated/fieldItems.json`; Test `tests/golden/fieldItems.test.ts`.

**Interfaces:**
- Consumes: none.
- Produces: `function heldItemId(id: number): number` — upstream `FieldItemDefinition.HeldItemId` (`Pick`, else `Dig`, else `Index`), identity for ids not in `FieldItemList.Items`; `function spriteItemId(id: number, itemCount: number): number` — port of `ItemSprite.TryGetFieldItemId` (identity when `id < itemCount`).

- [ ] **Step 1:** Write failing golden test: for every key of upstream `FieldItemList.Items` plus 50 sampled ids outside it, `spriteItemId` equals the value upstream returns (oracle exports expected pairs into `export-data` output).
- [ ] **Step 2:** Run, verify fail. **Step 3:** Implement; export `{id: {pick,dig,index}}` table in `ExportData` → `gen:data`. **Step 4:** Run, verify pass. **Step 5:** Commit `"Core: field item sprite remap (oracle-verified)"`.

### Task 5: Worker `api.map()`

**Files:** Modify `app/src/worker/protocol.ts`, `app/src/worker/handlers.ts`; Test `tests/unit/handlers.test.ts`.

**Interfaces:**
- Consumes: `readMap` (Task 3). 
- Produces: `Api.map(): Promise<MapView>` where `MapView = MapData & { revisionLabel: string }` (item names are not included), and `Api.itemName(raw: string): Promise<string>` resolving a name on demand from a 16-digit hex raw value. Typed arrays are returned through the existing worker bridge with transfer list; check `app/src/lib/api.ts` and `worker.ts` for how responses are posted and add transferables there.

- [ ] **Step 1: Failing tests** (handlers.test.ts pattern): `map()` throws "No save is loaded." before load; after load returns terrain 112×96 and item layers 288×192 for the example save; two calls return independent buffers; calling `map()` leaves `build("changed")` empty (read-only guarantee); `itemName("000000000000fffe")` is the "none" name and an unknown id does not throw.
- [ ] **Step 2:** Run, verify fail. **Step 3:** Implement (copy slices from `save.main.data`, never expose live buffer); add transfer support. **Step 4:** Pass. **Step 5:** Commit `"Worker: map() API"`.

### Task 6: Camera and tile math (pure)

**Files:** Create `app/src/map/camera.ts`, `app/src/map/tiles.ts`; Test `tests/unit/camera.test.ts`, `tests/unit/tiles.test.ts`.

**Interfaces:**
- Produces:
  ```ts
  type Camera = { x: number; y: number; zoom: number }; // world px at screen origin; zoom = screen px per world px
  const MIN_ZOOM: number; const MAX_ZOOM: number;
  function zoomAt(c: Camera, factor: number, sx: number, sy: number, bounds: Bounds, view: {w:number;h:number}): Camera; // keeps point under cursor fixed
  function panBy(c: Camera, dx: number, dy: number, bounds: Bounds, view: {w:number;h:number}): Camera;
  function clampCamera(c: Camera, bounds: Bounds, view: {w:number;h:number}): Camera;
  function screenToTile(c: Camera, sx: number, sy: number, grid: GridSpec): {x:number;y:number} | null; // null outside grid
  function tileToWorld(grid: GridSpec, x: number, y: number): {x:number;y:number};
  type GridSpec = { tileSize: number; width: number; height: number; originX: number; originY: number }; // origin from Task 2 ledger ruling
  type Bounds = { w: number; h: number };
  ```
- [ ] **Step 1: Failing tests:** zoom at cursor keeps world point stable (±1e-9); zoom clamps to `[MIN_ZOOM, MAX_ZOOM]`; pan cannot move the island fully off-screen; `screenToTile` returns `null` for negative, border and beyond-grid points and a correct tile at corners; no NaN for zero-size view (returns camera unchanged).
- [ ] **Steps 2–5:** run fail, implement, run pass, commit `"Map: camera and tile math"`.

### Task 7: Terrain palette and terrain image (pure)

**Files:** Create `app/src/map/terrainPalette.ts`, `app/src/map/terrainImage.ts`; Test `tests/unit/terrainImage.test.ts`.

**Interfaces:**
- Consumes: `TerrainLayer` (Task 3), unit model enum values (copy numeric ranges from `vendor/NHSE/NHSE.Core/Structures/Map/Terrain/TerrainUnitModel.cs`: Base 0x00, River 0x01–0x15, Cliff 0x16–0x29, Fall 0x3A+).
- Produces: `classifyUnit(model: number): "base"|"river"|"cliff"|"fall"|"other"`; `terrainColor(model: number, elevation: number, road: number): number` (RGBA u32, little-endian packed); `renderTerrainRGBA(t: TerrainLayer, scale: number): { width: number; height: number; pixels: Uint8ClampedArray }` (ocean color `0xFF80D7C3` outside land; road layer over base; elevation shading monotonic).

- [ ] **Step 1: Failing tests:** `classifyUnit` boundaries (0x00 base, 0x01 river, 0x15 river, 0x16 cliff, 0x29 cliff, 0x3A fall); higher elevation is never darker than lower on `base`; road model ≠ 0 overrides base color; `renderTerrainRGBA` size = `width*scale × height*scale` and a known corner pixel equals the expected color for the example save fixture-free synthetic layer.
- [ ] **Steps 2–5:** fail, implement (palette is one exported table), pass, commit `"Map: terrain palette and image"`.

### Task 8: Sprite source and sprite pack

**Files:** Create `app/src/map/spriteSource.ts`, `app/src/map/spritePack.ts`; Modify `app/package.json` (add `pixi.js` at the exact current v8 version after checking docs via context7; also add `fflate` if no zip reader exists — check `packages/io` first); Test `tests/unit/spriteSource.test.ts`, `tests/unit/spritePack.test.ts`.

**Interfaces:**
- Consumes: `spriteItemId` (Task 4), `getMenuIconSprite(id)` from core.
- Produces:
  ```ts
  interface SpriteSource { resolve(itemId: number, count: number): { kind: "pack" | "icon" | "leaf"; url: string } }
  function parsePackName(name: string): { id: number; variant: number } | null; // "00123_4.png" → {123,4}; case-insensitive .png; else null
  function createSpriteSource(pack: ReadonlyMap<string, string>, itemCount: number, base: string): SpriteSource; // pack key `${id}_${variant}` → object URL
  function importPack(files: { name: string; data: Uint8Array }[]): { entries: Map<string, Uint8Array>; skipped: number };
  const packStore: { save(entries: Map<string,Uint8Array>): Promise<void>; load(): Promise<Map<string,Uint8Array>>; clear(): Promise<void> }; // IndexedDB, all calls wrapped in try/catch, degrade to in-memory
  ```
- [ ] **Step 1: Failing tests:** `parsePackName` accepts `00001_0.png`, rejects `1.png`, `abc_0.png`, `00001_0.jpg`; lookup order `id_count` → `id_0` → icon → leaf (four cases); remap applies before lookup; `importPack` skips non-PNG, bad names and duplicates (keeps first) and reports `skipped`; empty input → empty map, `skipped 0`; `packStore` falls back to memory when IndexedDB throws.
- [ ] **Steps 2–5:** fail, implement, pass, commit `"Map: sprite source and sprite pack import"`.

### Task 9: Pixi scene

**Files:** Create `app/src/map/scene.ts`; Test: exercised by Task 11 (WebGL) plus a logic-only unit test of `visibleTileRange` in `tests/unit/tiles.test.ts`.

**Interfaces:**
- Consumes: Tasks 3, 6, 7, 8.
- Produces:
  ```ts
  type LayerId = "terrain" | "items0" | "items1" | "buildings" | "grid";
  interface MapScene { setLayerVisible(l: LayerId, on: boolean): void; setSprites(src: SpriteSource): void; setCamera(c: Camera): void; resize(w: number, h: number): void; destroy(): void }
  function createMapScene(canvas: HTMLCanvasElement, map: MapData): Promise<MapScene>;
  function visibleTileRange(c: Camera, view: {w:number;h:number}, grid: GridSpec): { x0:number; y0:number; x1:number; y1:number }; // inclusive, clamped to grid, empty when off-grid
  ```
- [ ] **Step 1:** Failing unit test for `visibleTileRange` (full view, zoomed corner, off-grid camera → empty). **Step 2:** fail. **Step 3:** Implement: terrain as one texture from `renderTerrainRGBA` on a `Sprite`; items as pooled `Sprite`s drawn only for the visible range with a lazily loaded texture cache (non-`none` items only); buildings as labeled `Graphics` rectangles + plaza marker using the Task 2 coordinate ruling; grid lines per acre; `destroy()` releases textures and the Pixi app. **Step 4:** Pass. **Step 5:** Commit `"Map: Pixi scene"`.

### Task 10: Map section UI

**Files:** Create `app/src/sections/map/MapSection.svelte`, `app/src/map/MapView.svelte`, `app/src/map/Inspector.svelte`; Modify `app/src/components/Sidebar.svelte` (enable Map), `app/src/App.svelte`, `app/src/lib/state.svelte.ts` (`Section` already has `"map"`); Test: `bun run typecheck`, `svelte-check`, Task 11.

**Interfaces:**
- Consumes: `api.map()`, `api.itemName`, scene (Task 9), `packStore` (Task 8).
- `MapSection` lazy-imports `MapView` (`await import(...)`) so PixiJS is a separate chunk; rebuilds the scene when `app.loaded` changes; layer toggle checkboxes; "Import sprites" file input (`webkitdirectory` + `.zip`) and "sprites: N loaded" + Clear; `Inspector` shows tile x/y, terrain fields (unit model, variation, angle, road, elevation), item raw/name/count for both layers, building under cursor; shows "nothing here" off-island/empty; read-only (no edit calls).

- [ ] **Step 1:** Implement per above; keyboard: arrow keys pan, `+`/`-` zoom. **Step 2:** `bun run typecheck`, `bunx svelte-check`, `bun run build` (confirm separate pixi chunk in output). **Step 3:** Manual check in `bun run dev` with the example save (record outcome in the ledger). **Step 4:** Commit `"Map section UI"`.

### Task 11: E2E and WebGL check

**Files:** Create `tests/e2e/map.spec.ts`; Modify `playwright.config.ts` if launch args are needed.

- [ ] **Step 1:** First verify headless Chromium creates a WebGL2 context (`page.evaluate(() => !!document.createElement("canvas").getContext("webgl2"))`); if false, add `--use-gl=swiftshader` / `--enable-unsafe-swiftshader`, else mark pixel assertions as skipped and assert scene-ready state only (record a `Ruling:`).
- [ ] **Step 2:** Test: load example save, open Map, wait for ready attribute on the canvas container, assert the canvas has non-uniform pixels (`toDataURL`/screenshot differs from blank), hover over the center and assert the inspector shows coordinates, toggle Terrain off and assert pixels change.
- [ ] **Step 3:** `NHSE_TEST_SAVE=$PWD/example-save-file bunx playwright test` passes, along with existing round-trip test. **Step 4:** Commit `"E2E: map viewer"`.

### Task 12: Docs and handoff

**Files:** Modify `README.md`, `docs/superpowers/HANDOFF.md`, `.gitignore` (`personal-sprites/`).

- [ ] Update README features and the sprite-pack note (no Nintendo art shipped; how to import your own). Update HANDOFF (state, new commands, map architecture facts, deferred minors, spike S pointer). Run full verification (`bun test`, `bun run typecheck`, `bunx playwright test`, `bun run build`) and paste results in the ledger. Commit `"Docs: map viewer handoff"`.

---

## Self-review notes

- Spec coverage: criteria 1 → Tasks 1–4; 2 → Tasks 9–11; 3 → Task 10/11; 4 → Tasks 8, 10; 5 → Task 5 test. Spike S is out of this plan by design.
- Open items carried as explicit steps rather than guesses: tile-grid alignment and building coordinate units (Task 2 step 3), PixiJS version/API (Task 8), headless WebGL (Task 11).
