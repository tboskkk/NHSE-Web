# Map Editor P2c: Terrain Brush Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Edit terrain tiles (stamp ground/road, elevation, rotate, clear road) in the browser, strictly validated and byte-identical to upstream NHSE.

**Architecture:** A new pure `terrainEdit` op (plan + byte writer in `packages/core/src/map/`) validated against an observed-combination table, wired through `applyOp`/`EditSession` like `mapEdit`/`buildingEdit`. The worker reports touched terrain tiles; `mapStore` patches them in place; a new Terrain tool in the map editor builds ops with pure helpers. A C# oracle command proves byte equality.

**Tech Stack:** Bun + TypeScript (`@nhse/core`), Svelte 5 + PixiJS app, C# reference CLI (`reference/`, upstream NHSE.Core), Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-11-22-map-editor-terrain-design.md`

## Global Constraints

- Terrain layer: 112x96 tiles, 14 bytes each (7 u16 LE: unitModel, variation, angle, roadModel, roadVariation, roadAngle, elevation), column-major `index = 96*x + y`, at `rev.mainOffsets.landMakingMap`.
- Strict edits only: a write is refused unless every rule passes; a refused op changes nothing (atomic).
- Only tiles in dynamic acres are editable; static-acre tiles are refused.
- Byte-identical to the C# oracle (`reference/`), checked by a golden test with `NHSE_TEST_SAVE`.
- Never commit `example-save-file/` or Nintendo sprites. No attribution lines in commits.
- Every deviation from this plan is a `Ruling:` line in that commit's body; all Rulings are reported at the end.
- Env: `export DOTNET_ROOT=~/.dotnet PATH=~/.dotnet:$PATH TMPDIR=$PWD/.superpowers/tmp`; tests: `NHSE_TEST_SAVE=$PWD/example-save-file bun test` (baseline 223 passing), `bunx playwright test` (4 pass), `cd app && bunx svelte-check`.
- Use `$state.raw` for anything holding an EditOp that is posted to the worker.

## Review Focus

1. A tile whose current ground/road triple is not in the observed set (a different save) but where only elevation changes: allowed (rules check only changed fields). Test in Task 2.
2. A stamp over a tile under an item/building that already stood on non-land: not blocked (cross-check refuses only newly stranded tiles; the example island has pre-existing violations). Test in Task 3.
3. Duplicate coordinates (last wins), and an op whose tiles equal the current ones: zero patches, no history entry. Test in Task 2.
4. Seven-wide-item-area revisions (item origin x != 0): terrain-to-item tile mapping in the cross-check. Test in Task 3.
5. A stroke that touches one static-acre tile is refused whole; undo/redo restores terrain in the viewer in place with no layer re-transfer. Tests in Tasks 2 and 6.

## File Structure

- Create `packages/core/src/map/applyTerrainEdit.ts`: `TerrainEditOp`, `TerrainTileValue`, `planTerrainEdit`, `writeTerrain`, `terrainTilesTouched`.
- Create `packages/core/src/generated/terrain-observed.json` + `scripts/gen-terrain-observed.ts` (`bun run gen:terrain`).
- Modify `packages/core/src/map/ground.ts` (export `staticClassAt`), `packages/core/src/edit/ops.ts`, `packages/core/src/index.ts`.
- Create `reference/Commands/TerrainEdit.cs`; modify `reference/Commands/Edit.cs`.
- Modify `app/src/worker/{handlers,protocol}.ts`, `app/src/lib/state.svelte.ts`, `app/src/map/{mapStore,scene,tools,MapToolbar,MapView}.svelte|ts`, `app/src/sections/map/MapSection.svelte`.
- Create `app/src/map/terrainTool.ts` (pure op builders), `app/src/map/TerrainPanel.svelte`.
- Tests: `tests/unit/{terrainEdit,terrainTool}.test.ts`, `tests/golden/terrainEdit.test.ts`, `tests/e2e/terrainEdit.spec.ts`; extend `handlers.test.ts`, `mapStore.test.ts`.

---

### Task 1: Observed-combination table

**Files:** Create `scripts/gen-terrain-observed.ts`, `packages/core/src/generated/terrain-observed.json`; modify `package.json` (script `gen:terrain`); Test `tests/unit/terrainObserved.test.ts`.

**Interfaces:**
- Produces: JSON `{ saves: number, ground: Record<string, number>, road: Record<string, number>, elevation: Record<UnitClass, [number, number]> }`. Keys are `"model,variation,angle"`; values are occurrence counts; `elevation` is min/max per `classifyUnit(groundModel)` class (from `ground.ts`).
- Produces: `bun scripts/gen-terrain-observed.ts [--merge] <saveDir>...` (default dir `$NHSE_TEST_SAVE`); without `--merge` it overwrites, with it counts add and ranges widen.

- [ ] **Step 1: Write the failing test** `tests/unit/terrainObserved.test.ts`: import the JSON; assert `ground["0,0,0"] > 0`, `road["0,0,0"] > 0`, every key matches `/^\d+,\d+,\d+$/`, `elevation.base` is a two-number array with min <= max, and every class key is one of the `UnitClass` values.
- [ ] **Step 2: Run** `bun test tests/unit/terrainObserved.test.ts`. Expected: FAIL (file missing).
- [ ] **Step 3: Implement the script.** Load each save with `HorizonSave.load(readDir(dir))`, `readMap`, tally per tile. Reuse the `readDir` pattern from `tests/golden/helpers.ts` (import it). Sort keys for stable output, write with 2-space JSON and trailing newline. Add `"gen:terrain": "bun scripts/gen-terrain-observed.ts"`.
- [ ] **Step 4: Run** `NHSE_TEST_SAVE=$PWD/example-save-file bun run gen:terrain`, then the test. Expected: PASS.
- [ ] **Step 5: Commit** `Terrain: observed combination table and generator`. Body `Ruling:` line: table lives in `packages/core/src/generated/` (not `app/public/data/` as the spec says) because core is pure and bundles generated JSON like `items.json`.

### Task 2: `terrainEdit` op: plan and writer

**Files:** Create `packages/core/src/map/applyTerrainEdit.ts`; modify `ground.ts`, `ops.ts`, `index.ts`; Test `tests/unit/terrainEdit.test.ts`.

**Interfaces:**
- Produces in `ground.ts`: `staticClassAt(ctx: GroundCtx, worldTx: number, worldTy: number): number | null`: the acre-template class for a world terrain tile, or null when the tile is dynamic (acre 0, >= 318, or class 7); `groundAt` is refactored to use it (behaviour unchanged).
- Produces: `type TerrainTileValue = { unitModel; variation; angle; roadModel; roadVariation; roadAngle; elevation: number }`; `type TerrainEditOp = { op: "terrainEdit"; label: string; changes: { x: number; y: number; tile: TerrainTileValue }[] }`; `const MAX_TERRAIN_EDIT_CHANGES = 112 * 96`.
- Produces: `planTerrainEdit(ctx: PlaceCtx, op: TerrainEditOp): TerrainWrite[]` where `TerrainWrite = { index: number; tile: TerrainTileValue }` (net changes only, ascending index; throws `RangeError` with a human reason on the first violation; never mutates `ctx`).
- Produces: `writeTerrain(main: Uint8Array, rev: Revision, writes: TerrainWrite[]): void` (patches only the 14-byte records).
- Produces: `terrainTileAt(map: MapData, index: number): TerrainTileValue`.
- `EditOp` gains `TerrainEditOp`; `validateOp`/`applyOp`/`describeOp` handle it exactly as `mapEdit` (needs `env.acreTiles`).

Rules in `planTerrainEdit` (in order, per change): integer coords inside 112x96; every field an integer 0..65535; duplicate coordinates collapse (last wins); tile in a dynamic acre else `"tile (x, y) is in a fixed acre"`; if the ground triple differs from the current one it must be in `observed.ground`, else `"ground combination not seen in real saves"`; likewise road with `observed.road`; if elevation differs it must be within `observed.elevation[classifyUnit(newGroundModel)]`, else `"elevation out of the observed range"`. Tiles equal to current produce no write.

- [ ] **Step 1: Write failing tests** in `tests/unit/terrainEdit.test.ts` using `emptyMap()`/`ctxOf` from `mapFixture.ts` (set `acres` so some acre is static: template table with a non-7 class). Tests (names exact): `a valid stamp returns one write at index 96*x+y`; `identical tile produces no writes`; `duplicate coordinates: last wins`; `unobserved ground triple is refused and nothing changes`; `elevation-only change on a tile with an unobserved triple is allowed` (Review Focus 1); `elevation outside the observed range is refused`; `static-acre tile is refused` and `a stroke touching one static tile is refused whole` (Review Focus 5); `out-of-range coordinates and non-integer fields throw RangeError`; `writeTerrain patches only changed records` (14-byte LE layout round-trips through `readTerrain`); `applyOp with terrainEdit is one undo step and undo restores the bytes` (use a real save under `goldenTest` if the fixture cannot carry a `HorizonSave`; otherwise cover in Task 4).
- [ ] **Step 2: Run** `bun test tests/unit/terrainEdit.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `staticClassAt` refactor, then `applyTerrainEdit.ts` per the signatures above (observed table imported from `../generated/terrain-observed.json`), wire `ops.ts` (`planFor`-style helper `terrainPlanFor(save, op, env)`; write with `writeTerrain(save.main.data, save.revision, writes)`), export from `index.ts`.
- [ ] **Step 4: Run** `bun test` (full). Expected: all prior tests plus the new ones pass.
- [ ] **Step 5: Commit** `Terrain: terrainEdit op, plan and writer`.

### Task 3: Cross-check against items, buildings and the plaza

**Files:** Modify `packages/core/src/map/applyTerrainEdit.ts`; Test `tests/unit/terrainEdit.test.ts`.

**Interfaces:**
- Consumes: `groundAt`, `itemToWorld`, `TERRAIN_ORIGIN_TILES`, `BUILDING_ITEM_TILES`, `PLAZA_ITEM_TILES`, `skipsGroundRule` (from core).
- Produces: `planTerrainEdit` additionally throws `RangeError("<what> would stand on <water|cliff|blocked ground>")` for the first item/building/plaza tile that was `land` before the edit and is not after. Pre-existing non-land is ignored. Check only changed terrain tiles: each terrain tile `(tx,ty)` covers item tiles `world = 2*(tx+16) + {0,1}`, `item = world - itemToWorld(acreW, 0, 0)`; evaluate `groundAt` on `ctx` and on a copy whose terrain arrays carry the writes. Building types with `skipsGroundRule` are exempt (as in `planBuildingEdit`).

- [ ] **Step 1: Write failing tests**: `stamping water under an item is refused naming the item layer`; `... under a building names "building in slot N"`; `... under the plaza names "the plaza"`; `an item already on non-land does not block an unrelated stamp` (Review Focus 2); `terrain-to-item mapping with a 7-wide item area (origin x = 32)` builds `emptyMap()` with item layers 224 wide (Review Focus 4); `making a tile land never blocks`.
- [ ] **Step 2: Run** the file. Expected: new tests FAIL.
- [ ] **Step 3: Implement** the check after the per-change rules, on the net writes. Reuse existing `rectOf`-style helpers if `applyBuildingEdit.ts` exports them; otherwise compute rects inline.
- [ ] **Step 4: Run** `bun test`. Expected: PASS.
- [ ] **Step 5: Commit** `Terrain: refuse edits that newly strand items, buildings or the plaza`. `Ruling:` line: the spec says "must still satisfy"; implemented as "must not newly violate" because the example island already has violations (see `placementConsistency.test.ts` allowlist).

### Task 4: C# oracle and golden test

**Files:** Create `reference/Commands/TerrainEdit.cs`; modify `reference/Commands/Edit.cs` (dispatch `terrainEdit`); Test `tests/golden/terrainEdit.test.ts`.

**Interfaces:**
- Oracle op JSON: `{op:"terrainEdit", changes:[{x,y,tile:{unitModel,...,elevation}, rotate?: true}]}`. For each change the C# builds a `TerrainTile`, fetches `layer.GetTile(x,y)` (`LayerTerrain` from `main`), applies `CopyGroundFrom`/`CopyRoadFrom`/`Elevation` from the given tile (or `TryRotate()` when `rotate`), then writes back with the upstream terrain setter (find it in `vendor/NHSE/NHSE.Core` `MainSave`: the `SetTerrain`/`LandMakingMap` accessor used by `GetTerrain`).

- [ ] **Step 1: Write the failing golden test** modelled on `tests/golden/buildingEdit.test.ts`: load the save, pick (deterministic scan) dynamic-acre tiles whose ground is `base`, and build ops: `stamp ground`, `stamp road`, `elevation +1`, `rotate road`, `rotate ground`, `clear road`, plus a `batch`. Use only combinations from `observed`. Apply via `runReference(["edit", SAVE, opsPath, "12345", out])` and via `applyOp`; assert all files byte-identical; assert `rotate` ops: the TS `rotateOp` result (Task 7 provides it; until then compute `(angle+1)&3` inline in the test) equals the oracle's `TryRotate` result.
- [ ] **Step 2: Run** `NHSE_TEST_SAVE=$PWD/example-save-file bun test tests/golden/terrainEdit.test.ts`. Expected: FAIL (oracle rejects unknown op).
- [ ] **Step 3: Implement** `TerrainEdit.cs`, rebuild: `dotnet build reference -c Release`.
- [ ] **Step 4: Run** the golden test. Expected: PASS (byte-identical).
- [ ] **Step 5: Commit** `Terrain: C# oracle and byte-identical golden test`.

### Task 5: Worker: touched terrain, plan API, parsed-map reuse

**Files:** Modify `app/src/worker/protocol.ts`, `handlers.ts`, `app/src/worker/worker.ts` (method registration if listed there); Test `tests/unit/handlers.test.ts`.

**Interfaces:**
- Produces in `protocol.ts`: `type TerrainTouched = { index: number; tile: TerrainTileValue }`; `EditResult` and `HistoryResult` gain `terrain: TerrainTouched[]`; `Api.terrainPlan(op: TerrainEditOp): Promise<{ ok: true } | { ok: false; reason: string }>`.
- `terrainTouchedBy(change)` in `handlers.ts`: terrain tiles whose 14-byte records a patch overlapped (`tile = floor((byte - landMakingMap)/14)`), with current values via `terrainTileAt`. `terrainPlan` uses the existing `planMap(save)` cache and `acreTiles()`; `edit/undo/redo` return `terrain`.

- [ ] **Step 1: Write failing golden tests**: `edit(terrainEdit) returns touched terrain tiles; undo and redo return old and new; item and building edits return an empty terrain list`; `terrainPlan reports the refusal reason and never dirties the save`; `terrainPlan sees edits, undo and redo` (cache invalidation, pattern from the existing buildingPlan cache test).
- [ ] **Step 2: Run** `NHSE_TEST_SAVE=... bun test tests/unit/handlers.test.ts`. Expected: new tests FAIL.
- [ ] **Step 3: Implement** the above; add `terrain: []` to existing result paths that return touched/structures.
- [ ] **Step 4: Run** `bun test` and `cd app && bunx svelte-check`. Expected: PASS, 0 errors.
- [ ] **Step 5: Commit** `Terrain: worker reports touched terrain and plans terrain edits`.

### Task 6: Viewer store, state events and terrain redraw

**Files:** Modify `app/src/map/mapStore.ts`, `app/src/lib/state.svelte.ts`, `app/src/map/scene.ts`, `app/src/map/MapView.svelte`, `app/src/sections/map/MapSection.svelte`; Test `tests/unit/mapStore.test.ts`.

**Interfaces:**
- `MapStore` gains `patchTerrain(t: TerrainTouched[]): void` (writes the seven arrays in place; throws `RangeError` before changing anything if an index is outside 112*96; empty list is a no-op; bumps `version` and `terrainVersion`) and `readonly terrainVersion: number`.
- `state.svelte.ts` gains `onTerrainTouched(cb: (t: TerrainTouched[]) => void): () => void`, emitted after edit/undo/redo exactly like `emitTouched`.
- `MapScene` gains `invalidateTerrain(): void` (re-run `renderTerrainRGBA` on the held map, `putImageData`, update the texture source). `MapView` takes a `terrainVersion` prop and calls it in its own `$effect`.

- [ ] **Step 1: Write failing tests** in `mapStore.test.ts`: `patchTerrain writes all seven fields in place and bumps version and terrainVersion`; `patchTerrain with a bad index throws and changes nothing`; `an empty patchTerrain does not bump versions`; `item patches do not bump terrainVersion`.
- [ ] **Step 2: Run** `bun test tests/unit/mapStore.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** store, event emitter, scene method, prop wiring (`MapSection` subscribes with `onTerrainTouched((t) => s.patchTerrain(t))` next to the existing subscriptions; reset `terrainVersion` on load like `structuresVersion`).
- [ ] **Step 4: Run** `bun test`, svelte-check. Expected: PASS.
- [ ] **Step 5: Commit** `Terrain: patch the viewer's terrain in place and redraw it`.

### Task 7: Terrain tool op builders (pure)

**Files:** Create `app/src/map/terrainTool.ts`; modify `app/src/map/tools.ts` (`Tool` gains `"terrain"`); Test `tests/unit/terrainTool.test.ts`.

**Interfaces:**
- Produces: `type TerrainMode = "stamp" | "elevation" | "rotate" | "clearRoad"`; `type StampPart = "ground" | "road" | "both"`.
- `stampOp(map: MapData, picked: TerrainTileValue, part: StampPart, tiles: {x:number;y:number}[]): TerrainEditOp` (copies ground and/or road fields onto each tile, keeps the rest incl. elevation, label `"Stamp terrain"`).
- `elevationOp(map, tiles, delta: 1 | -1): TerrainEditOp` (label `"Raise terrain"`/`"Lower terrain"`).
- `rotateOp(map, tiles): TerrainEditOp` (per tile: road angle `(a+1)&3` if `roadModel !== 0`; else ground angle `(a+1)&3` unless `unitModel === 0`, which is skipped; label `"Rotate terrain"`).
- `clearRoadOp(map, tiles): TerrainEditOp` (road model/variation/angle to 0, label `"Clear road"`).
- Each returns an op with `changes: []` when no tile qualifies (the caller shows "Nothing to change").
- `terrainTileUnder(map: MapData, terrainTile: {x:number;y:number}): TerrainTileValue | null` (bounds-checked read for the picker).

- [ ] **Step 1: Write failing tests**: stamp ground-only keeps road and elevation; stamp both; elevation ±1 clamps nothing itself (planner refuses out of range) but never goes below 0; rotate prefers road, skips base ground, wraps 3 to 0 (matches upstream `TryRotate`); clearRoad zeroes only road fields; empty qualifying set yields `changes: []`.
- [ ] **Step 2: Run** the file. Expected: FAIL.
- [ ] **Step 3: Implement** the pure builders.
- [ ] **Step 4: Run** `bun test`. Expected: PASS (the Task 4 golden test now uses `rotateOp`; update it to import it and re-run).
- [ ] **Step 5: Commit** `Terrain: tool op builders`.

### Task 8: Terrain tool UI

**Files:** Create `app/src/map/TerrainPanel.svelte`; modify `app/src/map/MapToolbar.svelte` (new tool button "Terrain", key `T`), `app/src/map/scene.ts` only if the ghost needs terrain-tile units (see below), `app/src/sections/map/MapSection.svelte`; Test: covered by Task 9 e2e plus `svelte-check`.

**Interfaces:**
- Consumes: Task 7 builders, `api.terrainPlan`, `api.edit`, `onTerrainTouched` (Task 6), `Ghost` from `scene.ts`.
- `TerrainPanel` props: `{ map: MapData; version: number; mode: TerrainMode (bindable); part: StampPart (bindable); picked: TerrainTileValue | null (bindable) }`. Shows mode buttons (Stamp, Elevation +/-, Rotate, Clear road), part selector, the picked tile's seven fields, and the text "Only combinations seen in real saves can be placed."
- Behaviour in `MapSection`: hover maps the item tile to a terrain tile `((worldItem >> 1) - 16)`; a click/drag collects terrain tiles with the existing `createStroke` (1x1); on end build the op, plan with `api.terrainPlan`, then `edit(op)` as one undoable step; a refusal toasts the reason. The ghost covers the 2x2 item tiles of the hovered terrain tile and is coloured by a debounced `terrainPlan` probe like the building ghost (`probeToken` pattern). Stamp with no picked tile first acts as eyedropper (click picks). Tool is hidden while `blocked`.

- [ ] **Step 1: Implement** panel, toolbar entry, `MapSection` wiring and keyboard shortcut `T`.
- [ ] **Step 2: Run** `cd app && bunx svelte-check` and `bun test`. Expected: 0 errors, all pass.
- [ ] **Step 3: Manual check** with the dev server (`bun run dev` in `app/`) and the example save: pick a base tile, stamp it, undo, refuse a static-acre tile. Report anything unexpected.
- [ ] **Step 4: Commit** `Terrain: terrain tool UI`.

### Task 9: End-to-end test and handoff

**Files:** Create `tests/e2e/terrainEdit.spec.ts` (pattern: `tests/e2e/buildingEdit.spec.ts`); modify `docs/superpowers/HANDOFF.md`.

**Interfaces:** Consumes the UI test ids; add `data-testid` attributes `tool-terrain`, `terrain-mode-<mode>`, `terrain-part-<part>` in Task 8 as needed.

- [ ] **Step 1: Write the e2e**: open the example save, edit mode, Terrain tool; stamp a tile on a known dynamic, base-ground tile (derive its screen position through the same helper approach the building e2e uses, or drive via the panel if the e2e has no pixel helper); expect "1 unsaved change"; undo then redo; save zip; reload; reopen the map and assert the tile reads back (use the Inspector's terrain text); a static-acre click is refused with a toast containing "fixed acre".
- [ ] **Step 2: Run** `NHSE_TEST_SAVE=$PWD/example-save-file bunx playwright test`. Expected: 5 pass.
- [ ] **Step 3: Update HANDOFF.md**: new "P2c terrain" section listing the op, rules, observed table and how to rescan (`bun run gen:terrain --merge <dir>`), oracle command, UI files, known gaps (observed-set width, no autotiling, static acres, no elevation overlay, in-game acceptance untested), and all Rulings.
- [ ] **Step 4: Run** the full suite once: `bun test`, `bunx playwright test`, `svelte-check`. Expected: all green. Clean the temp dir (it holds ~23 MB per golden/e2e run).
- [ ] **Step 5: Commit** `Terrain: e2e and handoff`.

---

## Self-review

- **Spec coverage:** op/writer (T2), strict validity rules 1-3 (T2), cross-check (T3), observed table + gen (T1), worker touched + plan + cache (T5), store/in-place patch/terrainVersion/redraw (T6), tools Stamp/Elevation/Rotate/Clear road (T7-T8), oracle + golden (T4), unit/e2e (T2-T9). Gap by choice: the spec's optional elevation overlay is left out (YAGNI; listed as a known gap in HANDOFF).
- **Type consistency:** `TerrainTileValue`, `TerrainEditOp`, `TerrainWrite`, `TerrainTouched`, `staticClassAt`, `terrainTileAt`, `patchTerrain`, `terrainVersion`, `invalidateTerrain` are defined once in the task that produces them and used by that name later.
- **Known deviations already declared as Rulings:** table location (T1), cross-check as "newly violates" (T3).
