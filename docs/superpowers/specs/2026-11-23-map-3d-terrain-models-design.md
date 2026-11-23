# Map 3D terrain models (design)

Sub-project 4 of the 3D editor (after viewer, editing and natural-item models). The 3D view draws the island's dynamic terrain tiles (rivers, cliffs, waterfalls, roads) as the game's real terrain pieces from the user's own romfs, in a git-ignored pack imported like the plant pack. Output is Nintendo-derived art: never committed, never uploaded. No furniture or villagers.

## Spike findings this design rests on (spike T, throwaway, scratchpad only)
- Romfs `Model/FldUnit` holds the flat ground tile (`Base_0`, 4 vertices) and the shared texture library (107 textures: `mGrass_Grd` ramp 64x96 RGBA8, `mCliff_Alb` BC1 512, `mRiver_Alb` BC1 512x128, `mWaterfall_Alb`, `mRoad*_Alb`/`_Grd`, snow variants, ...). `FldUnitRiver` (45 models), `FldUnitCliff` (44), `FldUnitFall` (47), `FldUnitRoadSoil/Stone/Brick/DarkSoil/FanPattern/Sand/Tile/Wood` (20 each) hold geometry only (no BNTX of their own; materials reference the `FldUnit` textures by name, e.g. `mCliff`, `mRiver`, `mGrass`, `mProcGrass`, `mGrassCliffXlu`, `mWaterfall`, `mRoadBrick`).
- `Bcsv/FieldLandMakingUnitModelParam.bcsv` has 246 rows = terrain unit ids (our `unitModel` values); its last column is the piece name: id 0 `Base`, 1.. `River0A, River1A, River2A, ...`, 18.. `Cliff0A` (three ids share `Cliff0A`, `Cliff1A`), then `Cliff*`, `Fall*`, `RoadSoil*`, `RoadStone*`, `Fall*` again, `RoadBrick*`, ... `RoadWood*`. A piece model is named `<name>_<variation>` (variation 0..3) and exists in the file of its family.
- Every piece is exactly 10 x 10 model units (-5..5), i.e. one terrain tile; with the item scale (5 model units = 1 item tile = 1 world unit) a tile is 2 world units, matching the viewer. Piece top surface is at y about 0.4; river pieces dip to -11.3 (river bed), cliff pieces to -15.1, waterfalls to -26.
- Rendered river, cliff, waterfall and brick-road pieces with the real textures look like the game's tiles; the existing grey-quad cliffs are not game-like.
- Not yet verified (calibrated in the plan): the angle -> rotation convention, the real level height (cliff depth 15 model units suggests 3 world units per level, ours is 2), grass summer colour from `mGrass_Grd`, how water surface and river bed are meant to combine.

## Goal and success
`bun run gen:models --romfs <dir>` also exports the terrain pieces into the same pack; with it imported, every dynamic terrain tile that is not plain ground draws as its game piece (unit id + variation + angle at its elevation level) in the 3D view; plain ground stays flat summer-green quads; static acres and the ocean stay as today. Success: on the example island rivers, cliffs, waterfalls and roads look like the game's; editing terrain in 3D (stamp, elevation, rotate) updates the pieces live; undo/redo, picking and ghosts still work; without a pack the view is exactly today's.

## Decisions
- v1 scope: dynamic terrain tiles inside the 112 x 96 terrain grid whose unit id is not 0 (`Base`): river, cliff, fall and road units, and road overlays (`roadModel`). Out: static acres, ocean and beach tiles (`FldOut*`), snow variants, water animation, seasons.
- Pieces go into the existing model pack: `models.json` gains an optional `terrain` object `{ "<unitId>_<variation>": "<modelKey>" }` plus normal `models` entries; manifest version stays 1 and older packs (without `terrain`) still import.
- Textures: one baked atlas PNG per piece family file (all materials of the family side by side, 128 px cells), shared by that family's pieces (`texture` path repeated in the manifest); materials bake as: grass family = fixed summer colour sampled from `mGrass_Grd`; `mCliff`/`mRiver`/`mRoad*` = their `_Alb`; ramp-driven road/water materials use the Task rules from the plant pack (`bake.ts`); transparent `*Xlu`/`OP` edges keep alpha cut-out.
- Placement: one `InstancedMesh` per piece key; instance transform = tile centre in world units, y = elevation level * `LEVEL_HEIGHT`, rotation = angle * 90 degrees about y (convention verified in the plan), uniform scale `MODEL_SCALE` (1/5).
- Tile replacement: tiles drawn as pieces are removed from the flat-tile field mesh (top quad and its cliff/bank walls); walls between remaining flat tiles stay; the water plane stays for ocean and the baseline sea.
- `LEVEL_HEIGHT` is recalibrated to the real cliff height (expected 3 world units) so pieces join their neighbours; the no-pack fallback uses the same value.
- Variation: use the tile's variation; if that piece does not exist use `_0`; unknown unit ids or missing pieces fall back to the flat tile.
- Live edits: `refreshTerrain` rebuilds the tile field and re-groups terrain pieces (measured to stay in the low milliseconds); edits do not reload the pack.

## Units
- `scripts/models/terrain.ts`: parse `FieldLandMakingUnitModelParam` (unit id -> piece name) and enumerate pieces per family file; `terrainPieces(src)` bakes one atlas per family and writes geometry (pack format of the plant pack, UVs into the family atlas cells); `generate.ts` calls it after the plant export and adds `terrain` to the manifest.
- `app/src/map3d/modelFormat.ts`: manifest type gains optional `terrain`; `parseManifest` validates it.
- `app/src/map3d/modelPack.ts`: `LoadedModels` gains `terrain: Map<string, string>` (`"<unit>_<var>"` -> model key); items of skipped models are dropped as for plants.
- `app/src/map3d/terrainPieces.ts` (pure): `groupTerrainPieces(map, field, terrain)` -> instances per piece key with tile centre, y, angle; marks which tiles are replaced; `terrainMesh.ts` takes the replaced set and skips those quads and their walls.
- `scene3d.ts`: draws the piece instances (same asset loading as plant models), passes the replaced set to `buildTerrainMesh`.

## Errors
A piece whose geometry or atlas fails to load leaves its tiles as flat quads. A pack without `terrain` behaves as today. Generation failures are per piece (reason in the report), never fatal.

## Testing (TDD)
- Unit (synthetic fixtures): unit-param parse (hashed headers, NUL padding, duplicate names), piece enumeration, atlas layout and UV cells, manifest `terrain` validation, `groupTerrainPieces` (key by unit_variation with `_0` fallback, rotation per angle, y per level, base tiles untouched, unknown ids unpieced), mesh builder skipping replaced tiles and their walls.
- Romfs-gated golden: export a river, a cliff, a fall and a road piece; manifest keys exist, geometry non-empty, atlas not blank, deterministic.
- Gated e2e: import the pack in 3D and the picture changes; terrain stamp in 3D redraws pieces; Clear restores the flat look.
- Measurement: pack size added by terrain, instance count and triangle count on the example island, terrain rebuild time with pieces.

## Out of scope
Static acres and ocean (`FldOut*`), beaches, seasonal grass colours, water animation and shading, snow variants, riverbed and water surface realism beyond what the pieces' own materials give, 2D use of the pieces.

## Roadmap (own specs)
Buildings (houses, Resident Services, Nook's, museum, airport); fences, rocks and shells; season selector; static acres and ocean.

## Assumptions to confirm in the plan
- `angle` 0..3 maps to 90-degree turns about y in the piece's own orientation (verified on a river bend against the existing flat map).
- Cliff pieces join tiles one level apart when `LEVEL_HEIGHT` equals their depth (about 3 world units).
- Triangle count with pieces stays near the plants' budget (hundreds of thousands).
