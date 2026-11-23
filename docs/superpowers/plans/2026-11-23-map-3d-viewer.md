# Map 3D Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A read-only "3D" view of the loaded island, toggled next to the 2D map in `MapSection`, built from the data the 2D map already holds.

**Architecture:** Three pure geometry builders (terrain heightfield with cliff walls, building boxes, item groups) tested under `bun test` without WebGL; a thin three.js scene (`scene3d.ts`) and a Svelte host (`MapView3D.svelte`) loaded as a lazy chunk; live updates ride the existing `MapStore` version counters.

**Tech Stack:** three.js 0.180.0 (+ `@types/three`), Svelte 5, bun test, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-23-map-3d-viewer-design.md`

## Global Constraints
- three.js pinned to exactly `0.180.0` (and `@types/three@0.180.0`); loaded only through dynamic `import()` so the main bundle does not grow.
- Read-only: no edit op, worker call or save change is added; Edit mode stays on the 2D view.
- Units: 1 world unit = 1 item tile; x east, z south, y up. A world terrain tile (144 x 128 grid, `WORLD_TILES` in `app/src/map/terrainImage.ts`) is 2 x 2 units; terrain grid origin is world terrain tile (16,16); item layer origin is `makeLayout(map.items[0].width / 32).items.originX / PX_PER_ITEM_TILE` (x) and 32 (z); buildings and plaza are already in world item-tile units; building box is `BUILDING_TILES` (4) wide, plaza 24 x 20.
- Tuning constants live only in `app/src/map3d/constants.ts`: `LEVEL_HEIGHT = 2`, `WATER_Y = -1.5`, `WATER_CLASSES = {1,5,12,15,46,149,150}` (tile classes drawn as water; verify by eye).
- No furniture or villager code; no Nintendo art or romfs data committed; no attribution lines in commits; any deviation from this plan is a `Ruling:` line in the commit body.
- Env for commands: `export DOTNET_ROOT=~/.dotnet PATH=~/.dotnet:$PATH TMPDIR=$PWD/.superpowers/tmp`; tests: `NHSE_TEST_SAVE=$PWD/example-save-file bun test` (baseline 294 passing with `NHSE_TEST_ROMFS` set, 261+ without) and `bunx playwright test` (5 e2e pass today).

## Review Focus
- All-ocean or empty map (`acres` all 0, no terrain variation): mesh is non-empty, finite, no walls (Task 1).
- Item whose id has no sprite: falls to the leaf group, never dropped or thrown (Task 2).
- Extension tiles, empty tiles and items rooted near the map edge are skipped or clamped, no out-of-range read (Task 2).
- Unused building slots (type 0) draw nothing (Task 2).
- WebGL unavailable: a visible message with a way back to 2D, not a blank panel (Task 4 e2e).

---

### Task 1: Dependency, constants and the terrain heightfield

**Files:** Modify `app/package.json` (`three`, `@types/three` 0.180.0); Create `app/src/map3d/constants.ts`, `app/src/map3d/terrainMesh.ts`; Test `tests/unit/terrainMesh.test.ts`.

**Interfaces:**
- Consumes: `MapData`, `TerrainLayer` (`@nhse/core`); `renderTerrainRGBA(t, acres, acreTiles, 1)` and `WORLD_TILES` from `app/src/map/terrainImage.ts`; `classifyUnit` from `@nhse/core`; `classColor`/`acreTileClass` logic as `terrainImage.ts` uses it (acre template class at `acreTiles[acre*256 + y*16 + x]`, class 7 = dynamic).
- Produces:
  - `TileField = { width: 144; height: 128; y: Float32Array; water: Uint8Array; rgb: Uint8Array /* 3 bytes per tile */ }`, index `wy * 144 + wx`.
  - `buildTileField(map: MapData, acreTiles: Uint8Array): TileField`: dynamic tiles inside the terrain grid get `elevation * LEVEL_HEIGHT` (water = river/fall class, y = `WATER_Y`); static-acre tiles are flat 0, or `WATER_Y` when their class is in `WATER_CLASSES`; tiles outside the terrain grid in acre 0 (ocean) are `WATER_Y`, `water = 1`; `rgb` is the pixel of `renderTerrainRGBA(..., 1)`.
  - `heightAt(f: TileField, x: number, z: number): number` (world units; clamps to the grid).
  - `type MeshData = { positions: Float32Array; colors: Float32Array; indices: Uint32Array }`; `buildTerrainMesh(f: TileField): MeshData`: per tile one top quad (4 own vertices, flat colour from `rgb`); for every east and south neighbour pair whose heights differ, one vertical wall quad from the lower to the higher height on the shared edge, colour cliff grey (118,122,132 scaled 0.8) when the lower tile is land, bank brown (138,122,90) when it is water; none at the grid border.

- [ ] **Step 1:** `cd app && bun add three@0.180.0 && bun add -d @types/three@0.180.0`; confirm `bun install` clean.
- [ ] **Step 2:** Write failing tests on `emptyMap()` (from `tests/unit/mapFixture.ts`): terrain tile (3,3) elevation 2 gives `y[(16+3)... ]` = `2 * LEVEL_HEIGHT` at world tile (19,19); a river-model tile (unitModel 1) has `y === WATER_Y` and `water === 1`; a tile outside the terrain grid (world (0,0)) is ocean (`WATER_Y`); a static acre (acres[0] = 5 with `acreTiles[5*256 .. ] = 0`) is flat 0 and with class 1 is `WATER_Y`. Mesh: an all-flat field has `positions.length === tiles*4*3` and zero walls; a single raised tile adds exactly 4 walls (its 4 neighbours) i.e. `indices.length === (tiles*2 + 4*2) * 3`; a raised tile next to a lowered water tile gets a bank-brown wall; an all-ocean map (every acre 0, flat terrain model 0 elevation 0 replaced by river model) yields finite positions and no walls; `heightAt` clamps outside the grid.
- [ ] **Step 3:** Run `bun test tests/unit/terrainMesh.test.ts`; expect FAIL (module missing).
- [ ] **Step 4:** Implement `constants.ts` and `terrainMesh.ts` per the Interfaces; reuse `renderTerrainRGBA` for colour rather than duplicating palette logic.
- [ ] **Step 5:** Run the test; expect PASS. Commit `3D: terrain heightfield and mesh builder`.

### Task 2: Building boxes and item groups

**Files:** Create `app/src/map3d/structureBoxes.ts`, `app/src/map3d/itemGroups.ts`; Test `tests/unit/structureBoxes.test.ts`, `tests/unit/itemGroups.test.ts`.

**Interfaces:**
- Consumes: Task 1 `TileField`, `heightAt`; `SpriteSource` (`app/src/map/spriteSource.ts`); `itemFootprint`, `isNone`, `isExtension` (`@nhse/core`); `makeLayout`, `PX_PER_ITEM_TILE`, `BUILDING_TILES` (`app/src/map/layout.ts`); the building skip rule of `scene.ts` `invalidateBuildings` (type 0 / unused slots draw nothing).
- Produces:
  - `type Box = { kind: "building" | "plaza"; type: number; x: number; z: number; w: number; d: number; y: number; h: number; color: number }`; `structureBoxes(map: MapData, f: TileField): Box[]`: plaza 24 x 20 plate `h = 0.2`, colour `0xbc8f8f`; building 4 x 4, `h = 6`, colour `0xffd400`; `y = heightAt` at the box centre.
  - `type Instance = { x: number; y: number; z: number; w: number; h: number }`; `type ItemGroups = { flat: Map<string, Instance[]>; upright: Map<string, Instance[]> }`; `groupItems(map: MapData, f: TileField, sprites: SpriteSource): ItemGroups`: both layers; for each root tile (skip none and extension) resolve `sprites.resolve(id, Number((raw >> 32n) & 0xffffn))`; kind `pack` goes to `flat` (lies on the ground, `w x h` = footprint, `y = ground + 0.05`), `icon` and `leaf` go to `upright` (square, side `max(w,h)`, bottom at ground); position = footprint centre from the root tile, ground from `heightAt`; key = sprite url.

- [ ] **Step 1:** Failing tests: plaza and one building produce boxes at the right x/z/size with `y` from an elevated tile; a building slot of type 0 yields nothing; `groupItems` on a map with one 2x2 item at root (10,12) of layer 0 and a stub `SpriteSource` returning `{kind:"pack",url:"p"}` puts one flat instance at centre `(originX+11, 32+13)`; `{kind:"icon"}` goes to upright with `w === h === 2`; an item id with no sprite (stub returns `leaf`) lands in upright under the leaf url; extension tiles (`0xfffd`) and empty (`0xfffe`) add nothing; an item rooted on the last tile of the layer does not throw and clamps its ground lookup.
- [ ] **Step 2:** Run both tests; expect FAIL.
- [ ] **Step 3:** Implement both modules (pure, no three.js imports).
- [ ] **Step 4:** Run both tests; expect PASS. Commit `3D: building boxes and item groups`.

### Task 3: Scene, host component, toggle

**Files:** Create `app/src/map3d/cameraKeys.ts`, `app/src/map3d/scene3d.ts`, `app/src/map3d/MapView3D.svelte`; Modify `app/src/sections/map/MapSection.svelte`; Test `tests/unit/cameraKeys.test.ts`.

**Interfaces:**
- Consumes: Tasks 1-2 builders; `MapStore` version props as `MapView.svelte` takes them (`map`, `acreTiles`, `sprites`, `version`, `structuresVersion`, `terrainVersion`).
- Produces:
  - `keyDelta(key: string, azimuth: number): { dx: number; dz: number; dPolar: number } | null`: W/ArrowUp, S/ArrowDown, A/ArrowLeft, D/ArrowRight pan 4 units relative to the camera azimuth; R/F tilt `dPolar = -/+0.05`; other keys null.
  - `createScene3D(canvas: HTMLCanvasElement, opts: { map: MapData; acreTiles: Uint8Array; sprites: SpriteSource; onError(msg: string): void }): Scene3D` with `Scene3D = { refreshTerrain(): void; refreshStructures(): void; refreshItems(): void; setGrid(on: boolean): void; resize(w: number, h: number): void; dispose(): void }`. Scene: hemisphere + directional light; terrain mesh (vertex colours, `MeshLambertMaterial`); one translucent water plane at `WATER_Y + 0.2`; boxes from `structureBoxes`; items as one `InstancedMesh` per sprite url (flat: plane lying down; upright: plane re-oriented to face the camera azimuth when it moves more than 0.05 rad); acre grid lines (32-unit) toggled by `setGrid`; `OrbitControls` target at world centre `(144, 0, 128)`, distance 20..400, polar 0.15..1.45, plus `keyDelta` on keydown; textures via `TextureLoader`, a failed texture skips that group; renderer creation failure or context loss calls `onError`.
  - `MapView3D.svelte`: props as above; `data-testid="map3d-host"` with `data-ready="true"` after the first render; effects on `version`/`structuresVersion`/`terrainVersion` call the matching refresh; `onerror` forwards.
  - `MapSection.svelte`: a "2D | 3D" segmented control (`data-testid="view2d"`, `data-testid="view3d"`); 3D lazy-imports `MapView3D`; while 3D is shown `mode` is forced to "view" and the toolbar's `blocked` text is "Switch to 2D to edit"; on a 3D error show the `.err` message with a "Back to 2D" button.

- [ ] **Step 1:** Failing tests for `keyDelta`: W at azimuth 0 moves toward -z (north) by 4, D toward +x, ArrowLeft opposite D; rotating azimuth by pi/2 rotates the delta; R/F give `dPolar` -0.05/+0.05; `"x"` returns null.
- [ ] **Step 2:** Run `bun test tests/unit/cameraKeys.test.ts`; expect FAIL. Implement `cameraKeys.ts`; expect PASS.
- [ ] **Step 3:** Implement `scene3d.ts`, `MapView3D.svelte` and the `MapSection` toggle per Interfaces.
- [ ] **Step 4:** `bun run typecheck && bun run build`; expect no errors and `three` appearing only in a lazy chunk (check `app/dist/assets` for a separate chunk; main chunk size within +5 kB of before).
- [ ] **Step 5:** Commit `3D: scene, view component and 2D/3D toggle`.

### Task 4: End-to-end, tuning, handoff

**Files:** Create `tests/e2e/map3d.spec.ts`; Modify `app/src/map3d/constants.ts` (tuned values), `docs/superpowers/HANDOFF.md`.

- [ ] **Step 1:** Write the e2e (pattern of `tests/e2e/terrainEdit.spec.ts`, skipped without `NHSE_TEST_SAVE`): open the Map, click `view3d`; wait for `[data-testid=map3d-host][data-ready=true]`; canvas screenshot length > 15000 bytes (a blank canvas compresses far smaller); press `R` and expect a different screenshot; click `view2d` and expect the 2D map host back; second test stubs `HTMLCanvasElement.prototype.getContext` to return null for `webgl`/`webgl2` via `page.addInitScript`, clicks `view3d` and expects a `role=alert` message plus a "Back to 2D" button that works.
- [ ] **Step 2:** Run `NHSE_TEST_SAVE=$PWD/example-save-file bunx playwright test tests/e2e/map3d.spec.ts`; if headless WebGL cannot render, record a `Ruling:` and make the first test skip with the reason (the second still runs).
- [ ] **Step 3:** Tune by eye: open the app in a browser with the example save, take 3D screenshots (default view, a cliff close-up, the river, a beach), adjust `LEVEL_HEIGHT`, `WATER_Y`, `WATER_CLASSES`, wall colours until cliffs, rivers and coast read correctly; record final values and what changed in the commit body as `Ruling:` lines. Show the user the screenshots.
- [ ] **Step 4:** Run the full suites: `NHSE_TEST_ROMFS=$HOME/Games/ACNH/romfs NHSE_TEST_SAVE=$PWD/example-save-file bun test`, `bunx playwright test`, `bun run typecheck`, `bun run build`; expect all green. Clean the 23 MB TMPDIR copies by literal-path rm.
- [ ] **Step 5:** Update HANDOFF.md (3D viewer: files, constants, controls, known gaps: static acres flat, coast is a wall, items without pack sprites use bundled icons, read-only) and commit `3D: e2e, tuning and handoff`. Do not push; report all `Ruling:` lines.
