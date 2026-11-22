# Map Editor P2a (Items) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strict, undoable editing of field items on both item layers (place, erase, rectangle, eyedropper, drag-paint, bulk cleanup) in the browser map viewer, byte-identical to upstream NHSE for every accepted edit.

**Architecture:** A new `mapEdit` `EditOp` in `packages/core` writes item tiles (and flag bits, per Task 1's finding) straight into `main.dat`; the existing byte-patch `EditSession` already gives undo/redo/dirty tracking, so no new undo system. Pure planner functions in core turn tool gestures into one `mapEdit` plus a skipped-tile report; strict placement rules live in core and are validated against a real save. The worker returns the touched tiles so the UI patches its map copy and scene in place. UI adds an Edit mode to the Map section.

**Tech Stack:** TypeScript (bun test, Svelte 5, PixiJS 8.23), C# oracle in `reference/` over pinned upstream `NHSE.Core`, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-22-map-editor-items-design.md` (viewer context: `2026-11-22-map-viewer-design.md`; handoff facts in `docs/superpowers/HANDOFF.md`).

## Global Constraints

- Branch `map-editor-items` off `main`; never commit `example-save-file/` or any Nintendo sprite; do not push without asking.
- Env: `export DOTNET_ROOT=~/.dotnet PATH=~/.dotnet:$PATH`; `dotnet build reference -c Release` before golden tests; `NHSE_TEST_SAVE=$PWD/example-save-file bun test` (130 pass at start).
- Item `raw` = u64 as 16-digit lowercase hex; item layers are column-major (`index = height*x + y`, 8-byte little-endian items); world/terrain/building geometry per HANDOFF "Map facts".
- Extension tile: item id `0xfffd`, `ExtensionItemId` (u16 at byte 4) = root id, `ExtensionX` (byte 6) / `ExtensionY` (byte 7) = offset from root, `SystemParam`/`AdditionalParam` = 0 (upstream `Item.SetAsExtension`). Erase = raw `0x000000000000fffe` (upstream `Item.Delete`).
- Footprint size = upstream `ItemInfo.GetItemSize`; odd `Rotation` (`SystemParam & 3`) swaps w/h; buried (`SystemParam & 4`) or dropped (`& 0x20`) items are 1x1.
- Strict rules (spec): in bounds; buildable ground; no building/plaza overlap; no item overlap on that layer; the whole op is validated before any byte changes; a failing placement changes nothing.
- A single `mapEdit` holds at most 55,296 changes (288*192).
- Every deviation from this plan is recorded as a `Ruling:` line in the execution ledger.
- Reply/commit style: commit after each task; no attribution lines in commit messages.

## Review Focus

1. Odd-rotation multi-tile item at the map edge or next to another item: expected refusal with a reason, no bytes changed (Task 3, 4).
2. Placing over an existing multi-tile item's *extension* tile, and erasing by clicking an extension tile: expected to act on the whole root footprint, leaving no orphan extension tiles (Task 4, 6).
3. Replace-all A→B where B is larger than A: expected skipped-with-count, never a partial footprint (Task 6).
4. Saves from pre-3.0.0 revisions (7-acre-wide item layer): expected same behavior with width 224; flags/offset math must come from `Revision.mainOffsets` not constants (Task 1, 4).
5. Undo after a save-then-continue-editing sequence, and a stroke that touches a tile twice: expected exact prior bytes, one undo step (Task 4, 7).

---

### Task 1: Flag layout finding (analysis + pinned test)

**Files:**
- Create: `tests/golden/itemFlags.test.ts`
- Modify (only if the finding requires): `packages/core/src/map/mapData.ts` (flag slicing), `tests/unit/mapData.test.ts`
- Create: `packages/core/src/map/flags.ts`

**Interfaces:**
- Produces: `flagPolicy: "bitmap" | "untouched"` plus, when `"bitmap"`, `flagBitIndex(width: number, x: number, y: number): number` (row-major, `y*width + x`) and `flagRegion(rev: Revision, layer: 0|1): { offset: number; bytes: number }` in `flags.ts`; `clearFlagBit(main: Uint8Array, rev: Revision, layer: 0|1, x: number, y: number): void`.

Background: upstream `MainSave.FieldItemFlagSize = TotalFieldItemTileCount / sizeof(byte)` (= one byte per tile, 55,296) while its comment says bitflags and `FieldItemFlagUpgrade` says the real size is 6,912 (bits, row-major, width 288). `FieldItemFlag0Data` is also a `.ToArray()` copy, so upstream flag edits may never be written back. Decide empirically.

- [ ] **Step 1: Write the analysis test** `tests/golden/itemFlags.test.ts` (golden, skipped without save). For the example save, for each candidate layout A (6,912-byte bitmap per layer, row-major `y*288+x`, layer 1 at `+6912`) and B (55,296 bytes per layer, one byte per tile, index per `y*288+x` and per column-major `288`-height index), compute: number of set flags, and how many set flags sit on a tile that is empty or an extension tile. Assert for the layout that the test finally pins: zero set flags on empty/extension tiles, and at least one flag on a root tile. Start with the test printing all four counts (`console.log`) and a placeholder `expect(true)`.
- [ ] **Step 2: Run** `NHSE_TEST_SAVE=$PWD/example-save-file bun test tests/golden/itemFlags.test.ts`. Expected: counts printed. Read them. If exactly one candidate has zero violations and ≥1 flag on roots → that is the layout.
- [ ] **Step 3: Rule.** Record `Ruling:` in the ledger with the counts. If layout A holds: implement `flags.ts` with policy `"bitmap"` and region `{offset: rev.mainOffsets.fieldItem + 2*layerBytes + layer*(width*height/8), bytes: width*height/8}`; change `readMap` so `ItemLayer.flags` slices these regions (not `count` bytes per layer) and update `tests/unit/mapData.test.ts` and `tests/golden/map.test.ts` expectations (the oracle `flag0/flag1` dump must be changed to the same slice sizes in `reference/Commands/MapDump.cs`). If layout B holds (or both/neither are consistent): policy `"untouched"` — `flags.ts` exports `flagPolicy = "untouched"` and `clearFlagBit` is a no-op; `mapEdit` never writes flag bytes, and the Final summary lists this as a known limit.
- [ ] **Step 4: Replace the placeholder** with the real assertions for the chosen layout (tiles with set flags are all roots; region sizes equal `flagRegion(...).bytes`); run it and `bun test` — expected: all pass.
- [ ] **Step 5: Commit** `"Map: item flag layout finding"`.

### Task 2: Item sizes and footprints

**Files:**
- Modify: `reference/Commands/ExportData.cs` (emit `itemSizes` and `itemSizeTypes` into `items.json`), regenerate via `bun run gen:data`
- Create: `packages/core/src/map/footprint.ts`, `tests/unit/footprint.test.ts`, `tests/golden/footprint.test.ts`
- Modify: `packages/core/src/index.ts` (export)

**Interfaces:**
- Produces: `itemFootprint(raw: bigint): { w: number; h: number }` (rotation/buried/dropped aware, uses `DisplayItemId` semantics: for an extension tile use its `ExtensionItemId`), `isExtension(raw: bigint): boolean`, `makeExtension(rootRaw: bigint, dx: number, dy: number): bigint`, `NONE_RAW = 0xfffen`, `EXTENSION_ID = 0xfffd`.

- [ ] **Step 1: Write failing unit tests** (`tests/unit/footprint.test.ts`): 1x1 item → `{w:1,h:1}`; a 2x2 furniture id (pick id from `itemSizes`, assert via the table) → `{2,2}`; same id with `SystemParam` rotation 1 and a 2x1 item → `{1,2}`; buried bit → 1x1; `makeExtension(root, 1, 1)` has id `0xfffd`, bytes 4-5 = root id, byte 6 = 1, byte 7 = 1, bytes 2-3 = 0.
- [ ] **Step 2: Run** `bun test tests/unit/footprint.test.ts` — Expected: FAIL (module missing).
- [ ] **Step 3: Oracle export:** in `ExportData.cs` write `itemSizes: number[]` (index = item id, value = `(byte)ItemInfo.GetItemSize((ushort)id)` for ids `0..item_size.bin length`) and `itemSizeTypes: {name, w, h}[]` (from `ItemSizeType` `Width`/`Height`, indexed by enum value). Run `dotnet build reference -c Release && bun run gen:data`. Implement `footprint.ts` over these tables (ids beyond the table → size type Unknown → treated as 1x1 but flagged `unknownSize: true` so placement refuses them — add `unknownSize` to the return type).
- [ ] **Step 4: Golden test** (`tests/golden/footprint.test.ts`): through the `reference` CLI add a small `item-size` command that, for every id 0..65535 and rotations 0-3, prints upstream `(w,h)` after the rotation swap; assert `itemFootprint` equals it for all. Run it — Expected: PASS.
- [ ] **Step 5: Run** `bun test` and `bun run typecheck`; commit `"Map: item footprints from upstream sizes"`.

### Task 3: Strict placement rules (pure core)

**Files:**
- Create: `packages/core/src/map/ground.ts`, `packages/core/src/map/placement.ts`, `tests/unit/placement.test.ts`, `tests/golden/placementConsistency.test.ts`
- Modify: `packages/core/src/index.ts`; move `classifyUnit`, `ACRE_TEMPLATE_COUNT` class handling used for ground into core (keep `app/src/map/terrainPalette.ts` re-exporting `classifyUnit` from core so the app still compiles)

**Interfaces:**
- Consumes: `MapData` (Task 1's `readMap`), `itemFootprint`/`isExtension`/`NONE_RAW` (Task 2), `acreTiles: Uint8Array` (`app/public/data/acretiles.bin`, 318 acres x 256 class bytes).
- Produces:
  - `type PlaceCtx = { map: MapData; acreTiles: Uint8Array }`
  - `groundAt(ctx: PlaceCtx, itemX: number, itemY: number): "land" | "water" | "cliff" | "blocked"` — item tile → world → terrain-resolution tile (item tile / 2, minus the layer origin in `layout.ts` terms) → acre template class if the acre is a template and the class is not dynamic (7), else terrain unit model class. Buildable (`"land"`) classes: acre classes 0 (grass), 4 (sand), 29, 44 (beach edge) and dynamic `base` or `road` unit models; everything else is `water`/`cliff`/`blocked`.
  - `checkPlacement(ctx: PlaceCtx, layer: 0 | 1, x: number, y: number, raw: bigint, opts?: { ignore?: Set<number> }): string | null` — `null` if valid, else the refusal reason (`"outside the map"`, `"water"`, `"cliff"`, `"blocked ground"`, `"overlaps a building"`, `"overlaps the plaza"`, `"overlaps another item"`, `"unknown item size"`); `opts.ignore` = tile indices treated as empty (used by replace and rectangle planners for tiles being cleared in the same op).
  - `rootOf(map: MapData, layer: 0|1, x: number, y: number): { x: number; y: number; raw: bigint } | null` — for any tile holding a root or extension, the root it belongs to (extension offsets); `null` for empty.
  - `footprintTiles(raw: bigint, x: number, y: number): { x: number; y: number }[]` (root first).

- [ ] **Step 1: Write failing unit tests** with a synthetic `MapData` built in the test (small helper `emptyMap()` producing a 288x192 two-layer map, flat grass terrain, no buildings): valid 1x1 on grass → `null`; 2x2 whose far corner is off the grid → `"outside the map"`; odd rotation swaps and is refused at the edge; footprint overlapping an existing item on the layer → `"overlaps another item"`; overlapping an extension tile → same reason; same position on the other layer → `null`; tile over a river unit model → `"water"`; over a cliff model → `"cliff"`; footprint overlapping a building rect (4x4 item tiles at `building.x/y`, type≠0) → `"overlaps a building"`; plaza 24x20 at `plaza.x/z` → `"overlaps the plaza"`; `rootOf` on an extension tile returns the root.
- [ ] **Step 2: Run** `bun test tests/unit/placement.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `ground.ts` and `placement.ts` to the signatures above. Item-tile → terrain-tile mapping uses the layout facts in HANDOFF (item origin x = ((9−acreW)/2)*32, y = 32; terrain at world (32,32), 2x2 item tiles per terrain tile); put the shared constants in core (`map/geometry.ts`) and have `app/src/map/layout.ts` import them rather than duplicating.
- [ ] **Step 4: Run unit tests** — Expected: PASS.
- [ ] **Step 5: Real-save consistency (golden)** `tests/golden/placementConsistency.test.ts`: load the example save, and for every existing root item on both layers assert `checkPlacement(ctx, layer, x, y, raw, { ignore: own footprint })` is `null`. Run it. Expected: PASS. If existing items violate a rule, that is data about the rule, not the save: list the violating ids/ground classes, adjust the buildable class set or the rule, record a `Ruling:` with the evidence, and re-run until the whole real island is consistent (a short allowlist of ids for known game-placed exceptions is allowed only with the ruling). Commit `"Map: strict placement rules"`.

### Task 4: `mapEdit` op (validate, apply, describe, undo)

**Files:**
- Modify: `packages/core/src/edit/ops.ts` (+ `packages/core/src/index.ts` exports)
- Create: `packages/core/src/map/applyMapEdit.ts`, `tests/unit/mapEdit.test.ts`

**Interfaces:**
- Consumes: Task 1 `clearFlagBit`/`flagPolicy`, Task 2 `itemFootprint`/`makeExtension`/`NONE_RAW`, Task 3 `checkPlacement`/`rootOf`/`footprintTiles`/`PlaceCtx`.
- Produces: `EditOp` gains `{ op: "mapEdit"; layer: 0 | 1; label: string; changes: { x: number; y: number; raw: string }[] }`. Semantics: each change is a *root-level intent*: `raw` = `"000000000000fffe"` erases the whole footprint rooted at or covering `(x,y)`; any other `raw` places that item with its root at `(x,y)`, first erasing whatever footprints it overlaps (replace). `validateOp` runs `checkPlacement` for each placement with `ignore` = the tiles being cleared by the same op; extension raw values (`id 0xfffd`) and ids ≥ the 16-bit range are rejected as input. `applyOp` writes erased tiles as `NONE_RAW`, placed root, then extension tiles (`makeExtension`), and calls `clearFlagBit` for every tile whose item was removed. `validateOp` needs `acreTiles`: signature becomes `validateOp(save, op, env?: { acreTiles?: Uint8Array })` and `applyOp(save, op, env?)`; a `mapEdit` without `env.acreTiles` throws `"Map data is not available."`. Op size cap 55,296 changes. `describeOp` → `op.label`.

- [ ] **Step 1: Failing tests** (`tests/unit/mapEdit.test.ts`; need `NHSE_TEST_SAVE` for a real `HorizonSave`, goldenTest-style, plus pure tests on `applyMapEdit` over a synthetic buffer): place 1x1 writes the 8 bytes at `fieldItem + 8*(height*x+y)` for layer 0 and layer 1 separately; place 2x2 writes root + 3 extensions with offsets (0,1),(1,0),(1,1) and root id; erase by clicking an extension tile clears the whole footprint; replace over a larger existing item clears all its old tiles; refused placement throws `RangeError` containing the reason and leaves bytes equal (compare full buffer hash before/after); duplicate coordinates in one op → last wins and still one valid result; >55,296 changes → `RangeError`; `EditSession.apply` + `undo` restores the exact bytes and `redo` re-applies; one op = one `changes.length` entry; `dirtyPairs()` is `{"main"}` only.
- [ ] **Step 2: Run** `NHSE_TEST_SAVE=$PWD/example-save-file bun test tests/unit/mapEdit.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `applyMapEdit(main: Uint8Array, rev: Revision, ctx: PlaceCtx, op)` in `applyMapEdit.ts` (reads the map once via `readMap`, plans the full tile write set in memory, validates, then writes) and wire `validateOp`/`applyValidated`/`describeOp` in `ops.ts`.
- [ ] **Step 4: Run** the new tests and full `bun test` — Expected: PASS.
- [ ] **Step 5: Commit** `"Map: mapEdit op"`.

### Task 5: Oracle `map-edit` and golden byte-identity

**Files:**
- Create: `reference/Commands/MapEdit.cs`; Modify: `reference/Program.cs` (register `map-edit`), `reference/Commands/Edit.cs` only if sharing the op JSON loader is simpler
- Create: `tests/golden/mapEdit.test.ts`

**Interfaces:**
- Consumes: `mapEdit` op JSON shape from Task 4; the `edit` CLI convention (`saveDir opsPath seed outDir`).
- Produces: CLI `map-edit <saveDir> <opsJson> <seed> <outDir>` applying the same ops via upstream `LayerFieldItem`/`LayerItem` APIs (`SetTile`, `SetExtensionTiles`, `DeleteExtensionTiles`, `Item.Delete`, `MainSave.SetFieldItemLayer0/1`, and the flag layer only when Task 1 chose `"bitmap"`), then saves with the seed.

- [ ] **Step 1: Failing golden test** `tests/golden/mapEdit.test.ts`: write an ops file containing (a) a 1x1 place on each layer, (b) a 2x2 place, (c) an odd-rotation 2x1 place, (d) an erase through an extension tile, (e) a replace over a larger item, each on tiles that Task 3's `checkPlacement` accepts (choose free grass tiles found programmatically from the example save, not hardcoded). Apply with the TS `applyOp` on a loaded save, `save(seed)`, and with `reference map-edit`; assert every output file's bytes are identical (use existing `hash`/`readDir` helpers like `edits.test.ts`).
- [ ] **Step 2: Run** — Expected: FAIL (`map-edit` unknown command).
- [ ] **Step 3: Implement** `MapEdit.cs`. Upstream's `SetExtensionTiles` clamps to grid bounds; the TS side already refuses out-of-bounds, so the test covers only in-bounds placements. Note any behavioral difference as a `Ruling:`.
- [ ] **Step 4: Run** `dotnet build reference -c Release` then the golden test and full `bun test` — Expected: PASS, all output files identical.
- [ ] **Step 5: Commit** `"Map: map-edit oracle and golden test"`.

### Task 6: Tool planners (pure core)

**Files:**
- Create: `packages/core/src/map/plan.ts`, `tests/unit/plan.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: Task 3 `PlaceCtx`, `checkPlacement`, `rootOf`, `footprintTiles`; Task 4 `mapEdit` op shape.
- Produces (all pure, never mutate `ctx.map`):
  - `type Plan = { changes: { x: number; y: number; raw: string }[]; skipped: { x: number; y: number; reason: string }[]; counts: { placed: number; erased: number; replaced: number } }`
  - `planPlace(ctx, layer, tiles: {x:number;y:number}[], raw: bigint): Plan` — tiles in stroke order; each placement is checked against the map *plus earlier placements in the same plan*; invalid tiles go to `skipped`.
  - `planErase(ctx, layer, tiles): Plan` — each tile resolves through `rootOf` to its root; duplicates collapse.
  - `planRect(ctx, layer, rect: {x0,y0,x1,y1}, raw: bigint | null): Plan` — `null` clears; otherwise stamps the item on a grid stepped by its footprint size (top-left anchored), skipping invalid cells.
  - `planReplaceAll(ctx, layer: 0|1|"both", from: bigint, to: bigint, match: "id" | "exact"): Plan[]` — one plan per layer; skips tiles where `to`'s footprint (with `from`'s footprint tiles ignored) is invalid, reason `"does not fit"` or the specific rule.
  - `planRemoveWhere(ctx, layer: 0|1|"both", pred: (rootRaw: bigint) => boolean): Plan[]`
  - `WEED_IDS: readonly number[]` — ids of field-item weeds from generated data (kind/name containing `Weed`; test pins the set is non-empty and every id's `fieldItems[id].name` includes "Weed").
  - `planToOp(plan: Plan, layer: 0|1, label: string): EditOp`.

- [ ] **Step 1: Failing tests** (synthetic map from Task 3's helper): drag over 5 tiles with one occupied → 4 changes, 1 skipped `"overlaps another item"`, `counts.placed === 4`; a 2x2 drag where two stamps overlap each other → second skipped; rectangle fill 4x4 with a 2x2 item → 4 stamps; clear rect removes only roots intersecting the rect and their full footprints (counts.erased); `planErase` on an extension tile yields one erase at the root; replace-all 1x1→2x2 skips tiles whose neighbor is occupied and reports them, never a partial footprint; `planRemoveWhere` over weed ids on both layers returns two plans whose change counts equal the number of matching roots; `planToOp(...)` validates under `validateOp` for every plan above (use the real save in a golden variant for `WEED_IDS`).
- [ ] **Step 2: Run** `bun test tests/unit/plan.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `plan.ts`; planners are the single place that decides skip-vs-place; `applyMapEdit` stays strict (a plan's changes always validate).
- [ ] **Step 4: Run** the tests and `bun test` — Expected: PASS.
- [ ] **Step 5: Commit** `"Map: edit tool planners"`.

### Task 7: Worker API and in-place map patching

**Files:**
- Modify: `app/src/worker/protocol.ts`, `app/src/worker/handlers.ts`, `app/src/worker/worker.ts` (acre templates load), `app/src/lib/state.svelte.ts`, `tests/unit/handlers.test.ts`
- Create: `app/src/map/mapStore.ts`, `tests/unit/mapStore.test.ts`

**Interfaces:**
- Consumes: Task 4 `applyOp(save, op, env)`; Task 6 planners.
- Produces:
  - `Api.edit(op)`, `Api.undo()`, `Api.redo()` results gain `touched: { layer: 0 | 1; index: number; raw: string }[]` (column-major tile index, new raw hex; empty array for non-map changes). Computed in the handler from the `Change.patches` of the last applied/undone/redone change, mapping patch byte ranges inside the two item layers back to tile indices and reading the current bytes. Undo/redo currently return a label string: change both to `{ label: string | null; touched: Touched[] }` and update `state.svelte.ts` callers.
  - `Api.mapPlan(req: PlanRequest): Promise<{ op: EditOp | null; counts: Plan["counts"]; skipped: number; sample: Plan["skipped"] }>` where `PlanRequest` is a tagged union `{ tool: "place"|"erase"|"rect"|"replaceAll"|"removeWhere"; layer; ... }` covering Task 6's planners (bulk "weeds" = `removeWhere` with `WEED_IDS`, `"id"` variants of remove/replace); it plans only, never edits. The UI applies the returned op through the normal `edit(op)`.
  - Worker loads `acretiles.bin` once at load (via the existing fetcher) and passes `{ acreTiles }` as `env` to `applyOp`/`validateOp`.
  - `mapStore.ts`: `createMapStore(initial: MapView)` → `{ map: MapView; patch(touched: Touched[]): void; version: number }` mutating `items[layer].raw` in place (`BigUint64Array`) and bumping a reactive `version`; used by `MapSection` so edits/undo never refetch whole layers.

- [ ] **Step 1: Failing tests:** handlers (golden-style): `edit(mapEdit)` returns `touched` listing exactly the changed tile indices with the new raw; `undo()` returns the same indices with the old raws; `redo()` matches the edit; non-map edit → `touched: []`; `mapPlan({tool:"place",...})` leaves `build("changed")` empty (no dirty pairs); a refused `mapEdit` rejects with the reason and `build("changed")` stays empty. `mapStore`: `patch` updates `raw` at the right index and bumps `version`; patching an index out of range throws.
- [ ] **Step 2: Run** `NHSE_TEST_SAVE=$PWD/example-save-file bun test tests/unit/handlers.test.ts tests/unit/mapStore.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** the protocol/handler changes and `mapStore.ts`; update `state.svelte.ts` `edit`/`undo`/`redo` to forward `touched` to a registered map-patch listener (`onMapTouched(cb)`), keeping their existing history behavior. Transferables: `transferables()` already walks results.
- [ ] **Step 4: Run** the new tests, `bun test`, `bun run typecheck` — Expected: PASS, 0 errors.
- [ ] **Step 5: Commit** `"Map: worker map edit API and store"`.

### Task 8: Scene — footprint sizing, patching, ghost

**Files:**
- Modify: `app/src/map/scene.ts`, `app/src/map/MapView.svelte`, `app/src/map/inspect.ts` (root/extension aware inspection)
- Create: `tests/unit/sceneModel.test.ts` for any pure helper extracted (e.g. `itemSpriteRect(raw, x, y)`)

**Interfaces:**
- Consumes: Task 2 `itemFootprint`, `isExtension`; Task 7 `mapStore.version`.
- Produces: scene draws a root item scaled to its footprint (w*tile × h*tile, from the root tile; extension tiles draw nothing) — fixes the known "multi-tile items drawn 1x1" gap; `MapScene.invalidateItems()` re-runs `refreshItems()` after a store patch; `MapScene.setGhost(g: { x: number; y: number; w: number; h: number; ok: boolean; label?: string } | null)` draws a green/red translucent footprint box with the item name label (works without sprites); `MapView` props gain `version: number` (re-run `invalidateItems` on change) and `ghost`, `tool` handlers deferred to Task 9. Inspector shows the root item when hovering an extension tile.

- [ ] **Step 1: Failing unit test** for the pure helper `itemSpriteRect(raw: bigint, x: number, y: number, tileSize: number)`: 2x2 root → rect `2*tile` square at the root; extension → `null`; rotated 2x1 → 1x2. Run — Expected: FAIL.
- [ ] **Step 2: Implement** the helper and use it in `refreshItems()`; add `invalidateItems`, `setGhost`; run unit test — Expected: PASS.
- [ ] **Step 3: Manual WebGL check:** run the app against the example save with the Playwright SwiftShader-capable headless Chromium (as in Task 11 of the viewer plan) and screenshot a region containing furniture; read the screenshot and confirm multi-tile items are no longer 1x1 squares. Ledger the observation.
- [ ] **Step 4: Run** `bun test`, `bun run typecheck`, `bunx playwright test` — Expected: PASS (existing 2 e2e).
- [ ] **Step 5: Commit** `"Map: footprint-sized items, ghost, in-place invalidate"`.

### Task 9: Edit mode UI

**Files:**
- Create: `app/src/map/tools.ts` (pure tool state machine), `app/src/map/MapBrush.svelte`, `app/src/map/MapToolbar.svelte`, `app/src/map/BulkPanel.svelte`, `tests/unit/tools.test.ts`
- Modify: `app/src/sections/map/MapSection.svelte`, `app/src/map/MapView.svelte`

**Interfaces:**
- Consumes: Task 7 `api.mapPlan`, `edit`, `onMapTouched`, `mapStore`; Task 8 `setGhost`/`invalidateItems`; existing `ItemFields.svelte` (props `raw, strings, catalog, onchange`), `loadCatalog` (`app/src/lib/catalog.ts`), `HashWarning` dismiss state.
- Produces:
  - `tools.ts`: `type Tool = "place" | "erase" | "rect" | "eyedropper"`; `createStroke(tool, layer)` → `{ add(x: number, y: number): void; tiles(): {x:number;y:number}[]; rect(): Rect | null; done(): StrokeResult }` where the stroke de-duplicates consecutive tiles and, for `rect`, only tracks the two corners; pure and unit-tested.
  - `MapToolbar`: View/Edit toggle (Edit disabled with a tooltip while the hash banner is un-dismissed), layer 1/2 selector (other layer dimmed via `layers` flags), tool buttons with keyboard shortcuts `P/E/R/I`.
  - `MapBrush`: current brush chip + `ItemFields` picker (search, variants, patterns); eyedropper sets it from the hovered root.
  - Behavior: hover → `api.mapPlan` is NOT used per move; ghost validity comes from a synchronous `checkPlacement` in the UI thread using the store's map (core is pure TS and importable in the app; `acreTiles` already loaded by `MapSection`); on pointer release the stroke goes through `api.mapPlan` (authoritative, in the worker) then `edit(op)`; the toast reports `placed N, skipped M (reason of first skip)`.
  - Panning: Space-drag or middle-drag pans in Edit mode; touch: one finger = tool, two = pan/zoom; Ctrl+Z / Ctrl+Y reuse existing undo/redo.
  - `BulkPanel`: "Remove all weeds", "Remove all of <item>", "Replace <A> with <B>", layer scope (1, 2, both); each calls `mapPlan` for counts, shows `n items, m skipped`, applies only on Confirm via `edit(op)` (a `batch` op when two layers).

- [ ] **Step 1: Failing tests** `tests/unit/tools.test.ts`: stroke de-dup; rect stroke keeps normalized corners regardless of drag direction; `done()` for `eyedropper` returns the single tile; a stroke of 0 tiles → `null`.
- [ ] **Step 2: Run** `bun test tests/unit/tools.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `tools.ts`, then the Svelte components and the MapSection/MapView wiring (Edit mode off by default; View mode keeps today's behavior exactly). Interaction code stays thin; decisions live in `tools.ts`, core planners, and the worker.
- [ ] **Step 4: Run** `bun test`, `bun run typecheck`, `bun run build` — Expected: PASS; main bundle size not increased by more than ~15 kB (Pixi stays lazy; core planner code is small).
- [ ] **Step 5: Commit** `"Map: edit mode UI"`.

### Task 10: E2E, docs, handoff

**Files:**
- Create: `tests/e2e/mapEdit.spec.ts`
- Modify: `README.md` (Map section: editing, strict rules, what is not enforced), `docs/superpowers/HANDOFF.md`, `.gitignore` only if needed

**Interfaces:**
- Consumes: hooks from the viewer (`[data-testid=map-host][data-ready=true]`, `map-canvas`, `sprite-status`) plus new `data-testid`s added in Task 9: `edit-toggle`, `tool-place`, `tool-erase`, `brush-chip`, `map-status`, `bulk-weeds`, `bulk-confirm`.

- [ ] **Step 1: Write the e2e** (skip without `NHSE_TEST_SAVE`): load the example zip, Map → Edit; pick a brush by catalog search; click an empty buildable tile near the center (find one via a test hook `window.__nhseFreeTile` exposed only when `import.meta.env.MODE !== "production"`, or compute from the oracle data read in the test); assert the canvas changed; press Ctrl+Z and assert the canvas equals the original screenshot; redo; Save as zip, reload the zip, reopen Map, and assert the inspector reports the placed item at that tile. Add: clicking an occupied tile with Place shows a refusal reason in `map-status` and leaves pixels unchanged; "Remove all weeds" shows a count, confirm removes them, undo restores. Run `NHSE_TEST_SAVE=$PWD/example-save-file bunx playwright test` — Expected: PASS (3+ tests).
- [ ] **Step 2:** Update README (editing section, strict rules, "not enforced: per-item game rules such as flower-only-on-grass", sprite note unchanged) and HANDOFF (state, new commands, architecture facts: `mapEdit` semantics, flag policy from Task 1, planners, `touched`, known gaps).
- [ ] **Step 3: Full verification** — `bun test`, `bun run typecheck`, `bunx playwright test`, `bun run build`; paste results in the ledger. Commit `"Docs: map editor P2a handoff"`.

---

## Self-review notes

- Spec coverage: rules/footprint/extension → Tasks 2-4; oracle byte-identity → Task 5; bulk actions, rect, drag, eyedropper, replace → Tasks 6, 9; undo/redo and dirty tracking → Task 4 (patch-based session) and Task 7; viewer multi-tile fix → Task 8; UI details (modes, picker, layer selector, ghost, touch/pan, hash-warning gating) → Task 9; tests/e2e/docs → Task 10; flag semantics risk → Task 1; buildable-ground risk → Task 3 step 5.
- Deviation from the spec text, ruled up front: undo needs no custom "diff" format because `EditSession` already records exact byte patches; the spec's "changed-tiles result" is the `touched` list from Task 7.
- Out of scope per spec: buildings, plaza, terrain, room layers, flag editing as a user feature.
