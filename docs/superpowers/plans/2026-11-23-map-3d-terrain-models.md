# Map 3D Terrain Models Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The 3D view draws the island's river, cliff, waterfall and road tiles as the game's real terrain pieces from the user's romfs (via the model pack), replacing the flat-colour quads for those tiles; plain ground and everything outside the dynamic terrain grid stay as today.

**Architecture:** `gen:models` additionally bakes one atlas per piece family and writes piece geometry plus a `terrain` table (`"<unit>_<variation>"` -> model key) into the existing pack; the browser parses it with the plants; a pure grouping step turns terrain tiles into piece instances and a "replaced tiles" mask; `buildTerrainMesh` skips replaced tiles; `scene3d` draws one `InstancedMesh` per piece key.

**Tech Stack:** bun, TypeScript strict, the existing .NET helper, three.js 0.180.0, Svelte 5, bun test, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-23-map-3d-terrain-models-design.md`

## Global Constraints
- Never commit Nintendo art, romfs bytes or generated output (`personal-models/` stays git-ignored; fixtures are synthetic).
- `Bcsv/FieldLandMakingUnitModelParam.bcsv` (hash columns): unit id `0x54706054` (NOT the row index; cliffs are ids 22..41, falls start at 59, roads at 71), piece name `0x39B5A93D`. Piece file = `"FldUnit" + name.replace(/\d.*$/, "")` (`River0A` -> `FldUnitRiver`, `RoadSoil3B` -> `FldUnitRoadSoil`, `Fall301` -> `FldUnitFall`, `Cliff2A` -> `FldUnitCliff`). Piece model name = `<name>_<variation>`, variation 0..3. Unit 0 (`Base`) is never a piece.
- Piece key = `<name>_<variation>` (unique across families); geometry `geo/<name>_<variation>.bin`; one atlas per family `tex/<file>.png` shared by that family's pieces (repeated in the manifest); atlas cells 128 px; a family's materials = union of textured materials of its models, sorted by name; piece UVs are remapped into that family-wide cell order (`u' = (u + k) / K`).
- Manifest stays version 1; new optional field `terrain: Record<string, string>` (`"<unitId>_<variation>"` -> model key). Packs without it still import and behave as before.
- Textures for pieces come from the shared `Model/FldUnit` BNTX (family files have none). Bake rules (`scripts/models/terrainBake.ts`): grass family (`mGrass*`, `mProcGrass*`) = summer colour sampled from `mGrass_Grd` (constants), alpha from `_OP` when present; `mCliff`, `mRiver2Cliff` = `mCliff_Alb`; `mRiver` = `mRiver_Alb`; `mWaterfall` = fixed light blue; `mRoad*` = `<mat>_Alb` if present else the ramp's mean colour; anything else is reported and baked magenta.
- Placement (world units = item tiles, terrain tile = 2 units): tile (tx,ty) in the 112 x 96 grid, column-major index `96 * tx + ty`; centre `x = (16 + tx) * 2 + 1`, `z = (16 + ty) * 2 + 1`; `y = elevation * LEVEL_HEIGHT`; rotation about y = `angle * 90 deg * ANGLE_DIR` (`ANGLE_DIR` = 1 initially, verified in Task 7); uniform scale `MODEL_SCALE` (1/5). A tile with unit id != 0 and a ready piece is drawn as a piece and removed from the flat mesh (top quad and walls touching it); a nonzero `roadModel` draws its road piece on top of the tile without replacing it. Variation fallback `_0`; no ready piece = flat tile.
- `LEVEL_HEIGHT` is recalibrated in Task 7 (expected 3); all tests import the constant.
- No attribution lines in commits; any deviation is a `Ruling:` line in the commit body.
- Env: `export DOTNET_ROOT=~/.dotnet PATH=~/.dotnet:$PATH TMPDIR=$PWD/.superpowers/tmp`; tests `NHSE_TEST_ROMFS=$HOME/Games/ACNH/romfs NHSE_TEST_SAVE=$PWD/example-save-file bun test` (baseline 370) and `bunx playwright test` (baseline 10); clean TMPDIR copies by literal-path rm. The example save has no road tiles, so roads cannot be checked on it by eye.

## Review Focus
- A unit id with no param row, a piece missing from its family file, or a missing family file: reported, no manifest entry, run continues (Tasks 1, 3).
- A tile whose piece asset failed to load, or a pack without `terrain`: the flat tile is drawn, never a hole (Tasks 5, 6).
- Variation outside the piece's range falls back to `_0` (Task 5).
- A terrain edit in 3D rebuilds the pieces and the replaced mask without reloading the pack (Task 6, Task 7 e2e).
- Terrain layer toggle hides pieces too (Task 6).

---

### Task 1: Unit table and piece families

**Files:** Create `scripts/models/terrain.ts`; Test `tests/unit/terrainUnits.test.ts`.

**Interfaces:**
- Produces: `parseUnitParam(tsv: string): Map<number, string>` (unit id -> piece name; cells stripped of NUL/whitespace; id from `0x54706054`, name from `0x39B5A93D`; unit 0 and rows without a name skipped; duplicate ids first-wins; throws naming a missing column); `pieceFile(name: string): string` per the constraint; `enumeratePieces(units: Map<number, string>): { file: string; names: string[] }[]` (distinct names grouped by file, files and names sorted).

- [ ] **Step 1:** Failing tests on a synthetic TSV: id column differs from row order (a `Cliff0A` at ids 22, 23, 24), unit 0 `Base` skipped, NUL padding, duplicate id, missing column throws; `pieceFile` for `River0A`, `RoadSoil3B`, `Fall301`, `Cliff2A`, `RoadFanPattern0A`; `enumeratePieces` groups and dedupes (`Cliff0A` once).
- [ ] **Step 2:** Run `bun test tests/unit/terrainUnits.test.ts`; expect FAIL. Implement; expect PASS. Commit `Terrain models: unit table and piece families`.

### Task 2: Terrain material baking

**Files:** Create `scripts/models/terrainBake.ts`; Modify `scripts/models/plantFile.ts` (`textures.bntx` optional -> `[]`); Test `tests/unit/terrainBake.test.ts`, `tests/unit/plantFile.test.ts` (extend, gated).

**Interfaces:**
- Consumes: `DecodedTexture` (`scripts/sprites/bntx.ts`), `bakeColourCell`, `bakeCell`-style helpers (`scripts/models/bake.ts`).
- Produces: `type TexLookup = (name: string) => DecodedTexture | null`; `bakeTerrainMaterial(material: string, tex: TexLookup, size: number): { cell: Uint8Array; known: boolean }` implementing the Global Constraints rules (`known = false` for the magenta fallback); `GRASS = { row: number; column: number }` constants (initial row 30 of 96, column at 60 % of the width) in `terrainBake.ts`; `loadPlantFile` returns `textures: []` when the BFRES has no `textures.bntx`.

- [ ] **Step 1:** Failing tests with synthetic textures: grass material returns the ramp pixel at the constant row/column with alpha 255, and takes alpha from `_OP` when given (value < 100 transparent); `mCliff` returns the resampled `mCliff_Alb`; `mRiver2Cliff` also uses `mCliff_Alb`; `mWaterfall` is fixed light blue; `mRoadBrick` uses `mRoadBrick_Alb`, `mRoadSoil` with only a ramp returns the ramp's mean colour; an unknown material returns magenta with `known: false`; missing source textures return magenta/`known: false` instead of throwing. Gated: `loadPlantFile(ROMFS, "FldUnitRiver")` now succeeds with `textures: []` and 45 models.
- [ ] **Step 2:** Run; expect FAIL. Implement; run with `NHSE_TEST_ROMFS`; expect PASS. Commit `Terrain models: material baking`.

### Task 3: Terrain piece export

**Files:** Modify `scripts/models/generate.ts`, `app/src/map3d/modelFormat.ts` (manifest `terrain`), `scripts/models/cli.ts`; Test `tests/unit/generateTerrain.test.ts`, `tests/golden/modelsRomfs.test.ts` (extend), `tests/unit/modelFormat.test.ts` (extend).

**Interfaces:**
- Consumes: Tasks 1-2, the existing `buildGeometry` (export it and give it an optional `materials` argument fixing the cell order), `ModelSource`.
- Produces: `ModelSource` gains `unitParam(): Promise<Map<number, string>>` (dump + `parseUnitParam`); `generateModels(opts, fieldItems, src)` additionally exports terrain unless `opts.terrain === false`: for each family file (`src.plant(file)`, skipped with reason `missing plant file <file>` when null) bakes one atlas from the `FldUnit` textures (`src.plant("FldUnit")`) with `bakeTerrainMaterial`, writes `geo/<name>_<v>.bin` for every existing `<name>_<v>` model (v 0..3), `tex/<file>.png`, adds `models[key]` and `terrain["<unit>_<v>"] = key`; `Report` gains `pieces: number`; manifest `terrain` is sorted and optional; `parseManifest` validates `terrain` (object of strings whose values exist in `models`); CLI prints piece counts and `--no-terrain` disables it.

- [ ] **Step 1:** Failing tests with a fake source: one family with two models (`RiverA_0`, `RiverA_1`) using two materials, a unit table mapping ids 1 and 2 to `RiverA`: manifest `terrain` keys `1_0`, `1_1`, `2_0`, `2_1`, one atlas PNG of 256 x 128 shared by both models, UVs inside the right cell, a unit whose piece model is missing is reported (`missing piece <name>_<v>`), a missing family file is reported, second run byte-identical, `terrain: false` writes none; manifest validation rejects a `terrain` value that is not a model key. Gated golden: export and assert `terrain["1_0"]` (River0A), `terrain["22_0"]` (Cliff0A) and a `Fall` and a `RoadBrick` entry exist, geometry non-empty, atlas not blank.
- [ ] **Step 2:** Run; expect FAIL. Implement. Run the unit and gated tests; expect PASS. Commit `Terrain models: piece export`.

### Task 4: Browser pack carries the terrain table

**Files:** Modify `app/src/map3d/modelPack.ts`; Test `tests/unit/modelPack.test.ts` (extend).

**Interfaces:**
- Produces: `LoadedModels` gains `terrain: Map<string, string>` (key -> model key); `parseModelPack` copies only entries whose model loaded (others dropped silently, counted in `skipped` once per skipped model as before); packs without `terrain` give an empty map.

- [ ] **Step 1:** Failing tests: a pack with `terrain` entries returns them; an entry pointing at a skipped model is dropped; a plant-only pack gives an empty map; the earlier tests still pass.
- [ ] **Step 2:** Run; expect FAIL. Implement; `bun run typecheck`; expect PASS. Commit `Terrain models: browser pack terrain table`.

### Task 5: Piece grouping and the replaced-tile mask (pure)

**Files:** Create `app/src/map3d/terrainPieces.ts`; Modify `app/src/map3d/terrainMesh.ts`, `app/src/map3d/constants.ts`; Test `tests/unit/terrainPieces.test.ts`, `tests/unit/terrainMesh.test.ts` (extend).

**Interfaces:**
- Consumes: `MapData`, `TileField`, `LEVEL_HEIGHT`, `MODEL_SCALE`.
- Produces: `type PieceInstance = { x: number; y: number; z: number; rotY: number }`; `groupTerrainPieces(map: MapData, terrain: ReadonlyMap<string, string>): { pieces: Map<string, PieceInstance[]>; replaced: Uint8Array /* 144 * 128, index wy * 144 + wx */ }` (unit != 0 with key `terrain.get("<unit>_<var>") ?? terrain.get("<unit>_0")` becomes a piece instance and marks its tile replaced; nonzero `roadModel` adds the road piece instance from `roadModel`/`roadVariation`/`roadAngle` without marking replaced; unknown units are ignored; `ANGLE_DIR` exported from `constants.ts`); `buildTerrainMesh(f: TileField, replaced?: Uint8Array): MeshData` (replaced tiles emit no top quad and no wall on any edge they touch; without the argument behaviour is unchanged).

- [ ] **Step 1:** Failing tests: a map with unit 1 variation 2 angle 3 at terrain tile (10,10) and `terrain` having `1_2` yields one instance at the tile centre, `y = elevation * LEVEL_HEIGHT`, `rotY = 3 * (PI / 2) * ANGLE_DIR`, and marks only world tile (26,26) replaced; a variation with no key falls back to `_0`; an unknown unit or a tile with unit 0 yields nothing; a road tile adds a road instance and leaves the tile unreplaced; an empty `terrain` map yields no pieces and an all-zero mask. Mesh: with a replaced mask the quad count drops by the masked tiles and no wall touches a masked tile; the old tests still pass unchanged.
- [ ] **Step 2:** Run; expect FAIL. Implement. Run `bun test tests/unit/terrainPieces.test.ts tests/unit/terrainMesh.test.ts`; expect PASS. Commit `Terrain models: piece grouping and replaced-tile mask`.

### Task 6: Draw the pieces

**Files:** Modify `app/src/map3d/scene3d.ts`, `app/src/map3d/MapView3D.svelte` (no change expected beyond the already-passed `models`).

**Interfaces:**
- Consumes: Tasks 4-5; the plant model asset loader already in `scene3d.ts` (`modelAssets`).
- Produces: `refreshTerrain()` groups pieces using only keys with a ready asset (`terrain` filtered by `modelAssets.has(key)`), passes `replaced` to `buildTerrainMesh`, builds one `InstancedMesh` per key in a `terrainPieces` group (`MeshLambertMaterial({ map, alphaTest: 0.5, side: DoubleSide })`, matrix = translate(x, y, z) * rotateY(rotY) * scale `MODEL_SCALE`), disposes the previous group's materials; `setModels` calls `refreshTerrain()` (not only `refreshItems()`) when the pack has a `terrain` table or the previous one did; `setLayers` hides the group with the terrain flag; piece keys also exist in `pack.models` so the loader already prepares them.

- [ ] **Step 1:** Implement per the Interfaces; `bun run typecheck && bun run build`; expect no errors.
- [ ] **Step 2:** Run the existing e2e suite (`NHSE_TEST_SAVE=... bunx playwright test`); expect all pass (no pack imported = unchanged behaviour). Commit `Terrain models: draw pieces in the 3D view`.

### Task 7: End-to-end, calibration, measurement, handoff

**Files:** Create `tests/e2e/map3dTerrain.spec.ts`; Modify `app/src/map3d/constants.ts` (`LEVEL_HEIGHT`, `ANGLE_DIR`), `scripts/models/terrainBake.ts` (`GRASS` and any rule fixes), `docs/superpowers/HANDOFF.md`.

- [ ] **Step 1:** Run the full export (`bun run gen:models --romfs ~/Games/ACNH/romfs`); record piece counts, skipped reasons, added pack size (`du -sh personal-models`) and wall time.
- [ ] **Step 2:** Gated e2e (`NHSE_TEST_ROMFS`, `NHSE_TEST_SAVE`): generate a pack, import it in 3D, the picture changes; a terrain stamp in 3D (as in `map3dEdit.spec.ts`) redraws and undo restores it; Clear restores the flat look.
- [ ] **Step 3:** Calibrate by eye with screenshots of the example island (river bends, a cliff step, a waterfall, the beach edge): set `LEVEL_HEIGHT` so cliffs of one level meet their neighbours (expected 3; the cliff piece depth is about 15 model units), set `ANGLE_DIR` (and any 90-degree offset) so river bends match the existing flat map, tune the grass colour and the water/river bed look, and show the user the screenshots. Record each change as a `Ruling:`. If roads cannot be checked on the example save, say so.
- [ ] **Step 4:** Measure: instance and triangle counts for pieces on the example island, `refreshTerrain` time with pieces (10 runs, median), and report; if over 50 ms, implement incremental regrouping of changed tiles (TDD) and record a `Ruling:`.
- [ ] **Step 5:** Full suites: `NHSE_TEST_ROMFS=$HOME/Games/ACNH/romfs NHSE_TEST_SAVE=$PWD/example-save-file bun test`, `bunx playwright test`, `bun run typecheck`, `bun run build`; expect all green. Clean TMPDIR copies.
- [ ] **Step 6:** Update HANDOFF.md (terrain pieces: pack `terrain` table, bake rules, constants, measurements, known gaps: static acres/ocean/beach flat, no snow or seasons, roads unverified on the example save, water look approximate) and commit `Terrain models: e2e, calibration and handoff`. Do not push; report all `Ruling:` lines.
