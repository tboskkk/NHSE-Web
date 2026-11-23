# Map 3D Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Edit mode works in the 3D map view with every existing tool (items, buildings, terrain), by giving `MapView3D` the same interaction interface the 2D `MapView` has.

**Architecture:** Pure helpers (`pick.ts`, `controlsMode.ts`, `gestures.ts`) carry all testable logic; `scene3d.ts` adds raycasting, a ground-draped ghost, runtime control reconfiguration and a `projectTile` hook; `MapView3D.svelte` wires pointer events to the gestures; `MapSection.svelte` passes the same `paint`, `ghost`, `paintGrid`, `onhover`, `layers` to either view. No tool, op or rule code changes.

**Tech Stack:** three.js 0.180.0 (already installed), Svelte 5, bun test, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-23-map-3d-editing-design.md` (builds on `2026-11-23-map-3d-viewer-design.md`)

## Global Constraints
- No change to `app/src/map/tools.ts`, `buildingTool.ts`, `terrainTool.ts`, core ops, planners or the worker; 2D editing behaviour and its e2e tests stay green.
- Units as the viewer: 1 world unit = 1 item tile, x east, z south, y up. Item tile of a world point: `x - originX`, `z - 32` with `originX = ((9 - itemAcreWidth) / 2) * 32`, in `[0, itemAcreWidth*32) x [0, 192)`. Terrain tile: `floor((x - 32) / 2)`, `floor((z - 32) / 2)` in `[0,112) x [0,96)`. `Ghost = { x, y, w, h, ok, label? }` is an item-tile rect (`app/src/map/scene.ts`).
- Edit-mode controls: left button or one finger paints; right-drag orbits; middle-drag or Space+left-drag pans; scroll zooms; two fingers dolly+rotate. View mode keeps today's controls. WASD, R/F, G unchanged.
- Billboard picking only when `paintGrid === "items"`; terrain tool picks the ground.
- No Nintendo art/romfs data committed; no attribution lines in commits; any deviation from this plan is a `Ruling:` line in the commit body.
- Env: `export DOTNET_ROOT=~/.dotnet PATH=~/.dotnet:$PATH TMPDIR=$PWD/.superpowers/tmp`; tests: `NHSE_TEST_ROMFS=$HOME/Games/ACNH/romfs NHSE_TEST_SAVE=$PWD/example-save-file bun test` (baseline 317 passing) and `NHSE_TEST_SAVE=$PWD/example-save-file bunx playwright test` (baseline 7). Chrome note: the user's Chrome needs `--ozone-platform=x11` for WebGL (already set up); headless Playwright is unaffected.

## Review Focus
- A ray that hits nothing, or a hit outside the item/terrain grid: `onhover(null)` equivalents, ghost hidden, no `paint` calls (Tasks 1, 3).
- Second finger, pointercancel or the canvas unmounting mid-stroke cancels the stroke, never commits it (Task 2, Task 4).
- Space held, or a non-left button, never starts a paint stroke (Task 2).
- 7-acre item layers (origin x = 32) convert tiles correctly in both directions (Task 1).
- Ghost on a ledge or beside a cliff takes the highest ground under its footprint, and a footprint at the map border does not read outside the grid (Task 1).
- Switching 2D/3D mid-edit keeps mode, tool and brush, and leaves no half-finished stroke (Task 4 e2e).

---

### Task 1: Picking maths (pure)

**Files:** Create `app/src/map3d/pick.ts`; Test `tests/unit/pick3d.test.ts`.

**Interfaces:**
- Consumes: `TileField`, `heightAt` (`app/src/map3d/terrainMesh.ts`); `Ghost` type (`app/src/map/scene.ts`, type import only).
- Produces:
  - `type Tile = { x: number; y: number }`.
  - `worldToItemTile(x: number, z: number, itemAcreWidth: number): Tile | null`; `itemTileOrigin(tile: Tile, itemAcreWidth: number): { x: number; z: number }` (world position of the tile's top-left corner; exact inverse).
  - `worldToTerrainTile(x: number, z: number): Tile | null`.
  - `footprintHeight(f: TileField, x: number, z: number, w: number, h: number): number`: max ground height under the world rect (x..x+w, z..z+h), sampled per whole unit plus the far edges, clamped to the grid.
  - `ghostCorners(g: Ghost, itemAcreWidth: number, f: TileField): Float32Array` (12 floats: four corners x,y,z of the rectangle at `footprintHeight + 0.15`, in winding order top-left, top-right, bottom-right, bottom-left).

- [ ] **Step 1:** Write failing tests: `worldToItemTile` for a 9-acre layer: `(0.5, 32.5, 9)` is `{x:0,y:0}`, `(287.9, 223.9, 9)` is `{x:287,y:191}`, `(-0.1, 40, 9)` and `(10, 224, 9)` are null; for 7 acres origin is 32: `(32.5, 32.5, 7)` is `{x:0,y:0}` and `(31.9, 40, 7)` is null; `itemTileOrigin(worldToItemTile(p)!)` is the tile's top-left for both widths; `worldToTerrainTile(32.5, 32.5)` is `{x:0,y:0}`, `(255.9, 223.9)` is `{x:111,y:95}`, `(31.9, 40)` and `(256, 40)` are null; `footprintHeight` on `buildTileField(emptyMap(), tiles)` with terrain tile (10,10) elevation 2 returns `2 * LEVEL_HEIGHT` for a rect covering it, 0 for a rect beside it, and does not throw for a rect hanging off the far corner; `ghostCorners` for a 2x2 ghost on that raised tile has all four y equal to `2 * LEVEL_HEIGHT + 0.15` and x/z spanning exactly 2 units.
- [ ] **Step 2:** Run `bun test tests/unit/pick3d.test.ts`; expect FAIL (module missing).
- [ ] **Step 3:** Implement `pick.ts` per the Interfaces (pure, no three.js).
- [ ] **Step 4:** Run the test; expect PASS. Commit `3D edit: picking maths`.

### Task 2: Gestures and controls mode (pure)

**Files:** Create `app/src/map3d/gestures.ts`, `app/src/map3d/controlsMode.ts`; Test `tests/unit/gestures3d.test.ts`, `tests/unit/controlsMode.test.ts`.

**Interfaces:**
- Consumes: `Tile` from Task 1.
- Produces:
  - `type PaintSink = { start(t: Tile): void; move(t: Tile): void; end(): void; cancel(): void }`.
  - `createGestures(o: { sink(): PaintSink | null; tileAt(x: number, y: number): Tile | null; spaceHeld(): boolean; onHover(x: number, y: number): void }): { down(e: {id: number; button: number; x: number; y: number}): boolean; move(e: {id: number; x: number; y: number}): void; up(e: {id: number; cancelled: boolean}): void; cancel(): void; readonly painting: boolean }`. `down` returns true when a paint stroke started (caller captures the pointer). Rules, as the 2D `MapView`: a stroke starts only if a sink exists, this is the only pointer, `button === 0`, space is not held and `tileAt` is non-null; a second `down` while painting calls `sink.cancel()`; `move` of an unknown pointer only calls `onHover`; `move` while painting calls `onHover`, then `sink.move(tile)` if `tileAt` is non-null; `up` while painting calls `sink.end()` (or `sink.cancel()` when `cancelled`); `cancel()` cancels an open stroke.
  - `type Action = "rotate" | "pan" | "dolly" | null`; `controlsConfig(editing: boolean, spaceHeld: boolean): { left: Action; middle: Action; right: Action; oneFinger: Action; twoFingers: "dolly-rotate" | "dolly-pan" }`: view mode `{left: rotate, middle: dolly, right: pan, oneFinger: rotate, twoFingers: dolly-pan}`; edit mode `{left: null, middle: pan, right: rotate, oneFinger: null, twoFingers: dolly-rotate}`; edit with space held makes `left: pan`.

- [ ] **Step 1:** Write failing tests with a recording fake sink: plain left-down then moves then up gives `start, move..., end`; `tileAt` null on down starts nothing; a null `tileAt` during a move is skipped; second pointer down cancels (`cancel`, no `end`); `up` with `cancelled: true` calls `cancel`; `cancel()` mid-stroke cancels and a later `up` calls nothing; right button, space held, no sink or a second simultaneous pointer never start; `move` of an unknown pointer calls only `onHover`. `controlsConfig` returns the three tables above, including the space-held edit case.
- [ ] **Step 2:** Run both tests; expect FAIL. Implement both modules; expect PASS.
- [ ] **Step 3:** Commit `3D edit: pointer gestures and control modes`.

### Task 3: Scene picking, ghost, controls and layers

**Files:** Modify `app/src/map3d/itemGroups.ts` (add `tile`), `app/src/map3d/scene3d.ts`; Test `tests/unit/itemGroups.test.ts` (extend).

**Interfaces:**
- Consumes: Tasks 1-2; `Ghost` and `LayerId` types from `app/src/map/scene.ts`.
- Produces:
  - `Instance` gains `tile: { x: number; y: number }` (the item's root tile in layer coordinates).
  - `Scene3D` gains: `pick(clientX: number, clientY: number, opts: { billboards: boolean }): { item: Tile | null; terrain: Tile | null } | null` (null when the ray hits nothing; item tile from a billboard hit is that instance's `tile`, terrain tile from the instance's centre; otherwise both from the terrain/water hit via `worldToItemTile`/`worldToTerrainTile`); `setGhost(g: Ghost | null): void` (translucent green `0x30c050` / red `0xd03030` quad from `ghostCorners` plus outline, `depthTest: false`, hidden for null); `setEditing(editing: boolean, spaceHeld: boolean): void` (applies `controlsConfig` to `OrbitControls.mouseButtons`/`touches`); `setLayers(l: Record<LayerId, boolean>): void` (visibility of item layers 0/1, buildings, grid; terrain off hides the terrain and water meshes); `projectTile(x: number, y: number): { x: number; y: number } | null` (item tile centre at ground height to CSS px relative to the canvas, null if behind the camera).
  - `groupItems` keeps both layers in the same groups; layer visibility works by giving `Instance` a `layer: 0 | 1` and splitting each url group's `InstancedMesh` by layer in the scene.

- [ ] **Step 1:** Extend `tests/unit/itemGroups.test.ts` with failing assertions: instances carry `tile` equal to their root tile (a 2x2 item at (10,12) has `tile {x:10,y:12}`) and `layer` 0 or 1 matching its layer.
- [ ] **Step 2:** Run it; expect FAIL. Add `tile` and `layer` in `itemGroups.ts`; expect PASS.
- [ ] **Step 3:** Implement the `Scene3D` additions in `scene3d.ts`: `Raycaster` against the upright `InstancedMesh`es (only when `billboards`), then the terrain mesh, then the water plane; split item meshes per layer for `setLayers`; ghost mesh and outline created once and updated per call; `setEditing` maps `Action` to `THREE.MOUSE`/`THREE.TOUCH` (`null` disables). Check the `OrbitControls` typings in `three@0.180.0` accept `null` for disabled buttons; if not, use `-1` and record a `Ruling:`.
- [ ] **Step 4:** `bun run typecheck && bun test tests/unit/itemGroups.test.ts`; expect PASS. Commit `3D edit: scene picking, ghost, control modes and layers`.

### Task 4: Wire the view and the section

**Files:** Modify `app/src/map3d/MapView3D.svelte`, `app/src/sections/map/MapSection.svelte`.

**Interfaces:**
- Consumes: Tasks 1-3; the 2D `MapView` prop shapes (`paint`, `ghost`, `paintGrid`, `onhover`, `layers`, `dim` is not supported in 3D).
- Produces: `MapView3D` props `paint: PaintSink | null`, `ghost: Ghost | null`, `paintGrid: "items" | "terrain"`, `layers: Record<LayerId, boolean>`, `onhover(h: { terrain: Tile | null; item: Tile | null } | null): void`; the host element has `data-testid="map3d-host"` and a property `projectTile(x, y)` (delegating to the scene) for e2e; the caption under the canvas shows `ghost.label` when set, else the controls hint.

- [ ] **Step 1:** `MapView3D.svelte`: create gestures with `tileAt` = `scene.pick(...)` mapped to the tile of `paintGrid` (item or terrain), `spaceHeld` from key state (Space down/up on the canvas), `sink` = the `paint` prop; pointer handlers mirror `MapView.svelte` (down captures the pointer when a stroke starts, move reports hover via at most one `pick` per animation frame and `onhover({terrain, item})` or `null` on a miss/leave, up/cancel, `pointerleave` calls `onhover(null)`); call `scene.setEditing(paint !== null, spaceHeld)` when either changes; `scene.setGhost(ghost)`, `scene.setLayers(layers)` in effects; on destroy call `gestures.cancel()`; `oncontextmenu` prevents the browser menu in edit mode.
- [ ] **Step 2:** `MapSection.svelte`: pass `{paint} {ghost} paintGrid={...} {layers} {onhover}` to `MapView3D` exactly as to `MapView`; make `toolbarBlocked` just `blocked`, `editing` independent of the view, and delete the `$effect` that forces View mode in 3D.
- [ ] **Step 2b:** Verify nothing else reads `view === "2d"` for editing logic (`grep -n 'view ===' app/src/sections/map/MapSection.svelte`).
- [ ] **Step 3:** `bun run typecheck && bun run build`; expect no errors. Run the existing 2D e2e (`bunx playwright test tests/e2e/mapEdit.spec.ts tests/e2e/terrainEdit.spec.ts tests/e2e/buildingEdit.spec.ts tests/e2e/map3d.spec.ts`); expect pass (the 3D e2e's `edit-toggle` disabled assertion must be updated to enabled).
- [ ] **Step 4:** Commit `3D edit: wire tools into the 3D view`.

### Task 5: End-to-end, measurement, handoff

**Files:** Create `tests/e2e/map3dEdit.spec.ts`; Modify `tests/e2e/map3d.spec.ts` (edit toggle now enabled), `docs/superpowers/HANDOFF.md`.

- [ ] **Step 1:** Write the e2e (pattern of `tests/e2e/mapEdit.spec.ts`, skipped without `NHSE_TEST_SAVE`): open Map, `view3d`, Edit, choose a brush and the Place tool; place an item on a free tile via `projectTile` (read through `page.evaluate` on `[data-testid=map3d-host]`); the unsaved counter reads "1 unsaved change" and a canvas screenshot differs; undo returns "0 unsaved" and the screenshot matches the original; redo; drag-fill an area with the Fill tool (counter increments once); a refused placement (on water) shows its reason in the caption; terrain tool: stamp a picked ground tile and confirm the screenshot differs and undo restores it; switch to `view2d` and back with edits pending: mode, tool and brush are unchanged and the counter is unchanged; Save, reload and reopen the 3D view and confirm the placed item is still there (screenshot compare with a post-edit screenshot).
- [ ] **Step 2:** Run `NHSE_TEST_SAVE=$PWD/example-save-file bunx playwright test tests/e2e/map3dEdit.spec.ts`; fix real defects via TDD (a failing unit test first where the defect is in pure code); a flaky screenshot assertion is a defect in the test, not a reason to loosen it blindly.
- [ ] **Step 3:** Measure the terrain rebuild: in a throwaway script or test, time `buildTileField` + `buildTerrainMesh` on the example save over 10 runs and record the median; if it is over 50 ms, implement an incremental height patch in `scene3d.ts` (TDD against `terrainMesh.ts`) and record a `Ruling:`; otherwise record the number in the commit body.
- [ ] **Step 4:** Manual check by eye with screenshots: ghost on flat ground, on a cliff edge and over water; hover near the island edge; confirm right-drag orbit and Space-pan in a headed run if a display is available; show the user the screenshots.
- [ ] **Step 5:** Full suites: `NHSE_TEST_ROMFS=$HOME/Games/ACNH/romfs NHSE_TEST_SAVE=$PWD/example-save-file bun test`, `bunx playwright test`, `bun run typecheck`, `bun run build`; expect all green. Clean the TMPDIR copies by literal-path rm.
- [ ] **Step 6:** Update HANDOFF.md (3D editing: files, controls, test hook, measurement, known gaps: no hidden-item picking, no dimmed layer, no inspector in 3D, no acre swaps) and commit `3D edit: e2e, measurement and handoff`. Do not push; report all `Ruling:` lines.
