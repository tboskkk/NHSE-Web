# Map 3D viewer (design)

Sub-project 1 of the 3D editor (see "Roadmap"). A read-only 3D view of the island, toggled next to the 2D map. Style reference: bobacupcake's Island Planner (cliff/terrain planner with orbit camera); we write our own code, nothing is copied. Scope is only what is safely editable later: terrain, cliffs, rivers, beaches, buildings and natural items. No furniture or villagers, ever.

## Goal and success
A "2D | 3D" toggle in `MapSection`. 3D shows the loaded save as a lit scene you can orbit, tilt and zoom, that follows live map state (edits made in 2D appear when you toggle back to 3D, and any patch to the held `MapStore` updates the scene). Success: the example save's island is recognisable (cliffs read as cliffs, rivers sit below the land, ocean surrounds it, buildings and plaza stand where the 2D map puts them, item sprites stand upright at their tiles); orbiting stays smooth with thousands of items.

## Decisions
- three.js, exact pinned version, loaded as a lazy chunk (like PixiJS 8.23.0 for `MapView`); nothing is fetched until 3D is opened.
- Ground: one heightfield over the 112x96 terrain tiles inside the 144x128 world-tile grid (`WORLD_TILES`); a tile's height = `elevation level (0..2) * LEVEL_HEIGHT`; river/fall/ocean tiles sit below sea level under one flat translucent water plane. Vertical cliff-wall quads (cliff grey) are added wherever neighbouring tiles differ in height.
- Colour: reuse the 2D terrain texture (`renderTerrainRGBA`) over the mesh, nearest-neighbour filtering, so ground/sand/road/static-acre colours match 2D.
- Static acres have no elevation: rendered flat, water-class tiles lowered.
- Buildings and plaza: coloured boxes at their footprints (`BUILDING_TILES`), same colours/names as 2D.
- Items: upright billboards from the existing `SpriteSource` (imported pack or bundled icons), instanced per texture; items with no sprite are skipped (as in 2D); items are positioned by root tile and footprint like the 2D layout.
- Camera: orbit/tilt/zoom with limits, WASD/arrows pan, R/F tilt, G grid toggle; mouse and touch.
- Live: subscribes to `MapStore`; terrain, structures and items rebuild independently on `terrainVersion`, `structuresVersion`, `version`.
- Read-only in v1; Edit mode and its tools stay on the 2D view.

## Units (`app/src/map3d/`)
1. `terrainMesh.ts` (pure): `(terrain: TerrainLayer, acres: Uint16Array, acreTiles: Uint8Array) -> {positions, indices, uvs, waterTiles}`; includes cliff walls.
2. `structureMeshes.ts` (pure): box geometry data for buildings/plaza.
3. `itemInstances.ts` (pure): groups visible item roots by sprite url into instance transforms.
4. `scene3d.ts`: three.js glue (scene, lights, meshes, camera, patch handlers, dispose).
5. `MapView3D.svelte`: canvas host, input, props mirror `MapView` (`map`, `acreTiles`, `sprites`, versions).
6. `MapSection.svelte`: the 2D/3D toggle; 3D disables Edit mode with a hint.

## Errors
WebGL unavailable or context lost: show a message with a "back to 2D" action, never a blank panel. A texture that fails to load skips that sprite group.

## Testing (TDD)
- Unit (bun, no WebGL): terrain heights per elevation level; cliff walls only where heights differ and facing the lower tile; river/fall/ocean tiles lowered; static-acre tiles flat; vertex/index counts for a small fixture; items grouped per sprite url with correct anchor; building boxes at footprints.
- Playwright smoke test with the example save (`NHSE_TEST_SAVE`): toggle to 3D, canvas draws non-blank pixels, back to 2D keeps the 2D view intact. The plan confirms headless WebGL works first; if it does not, the smoke test is skipped with a reason and a manual check list replaces it.

## Out of scope
Editing in 3D, romfs models, acre swaps, shadows, water animation, minimap (the 2D map is the minimap), furniture and villagers.

## Roadmap (own specs)
2. 3D editing: picking and ghosts in 3D, reusing the validated ops (terrain brush, item place/erase, building move); shared undo.
3. Natural-item models: extend `gen:sprites` to export meshes/textures for trees, bushes, flowers, weeds into a git-ignored pack, imported like the sprite pack; 3D falls back to billboards where no model exists.
4. Acres, only if the save allows safe swaps.

## Assumptions to confirm in the plan
- `LEVEL_HEIGHT` and the water level are tuned by eye on the example save (constants in one place).
- three.js `OrbitControls` is acceptable for orbit/pan/zoom, with R/F and WASD layered on top.
- Instanced billboards are fast enough for the item counts on a full island; measured in the plan.
