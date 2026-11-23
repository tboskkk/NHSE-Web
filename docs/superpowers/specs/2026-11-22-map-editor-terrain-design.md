# Map editor P2c: terrain brush

## Goal
Edit terrain tiles in the browser with the same guarantees as items and buildings: every edit is a byte patch, undoable, strict (only values known to be valid), and byte-identical to what upstream NHSE's C# code writes (the `reference/` oracle).

## Scope
In: a raw tile brush over the 112x96 terrain layer: stamp ground and/or road from a picked tile, elevation steps, rotate, clear road.
Out: neighbour-aware autotiling, acre-layout/template swaps, editing tiles inside static acres, item flag semantics, any combination not observed in real saves.

## Facts this builds on
- `TerrainTile` is 14 bytes: unitModel, variation, angle (ground), roadModel, roadVariation, roadAngle, elevation; all u16 LE, column-major (`index = height*x + y`). Already read by `packages/core/src/map/terrainTile.ts`.
- Ground rules (`ground.ts`) read terrain only for acres whose template class is 7 (dynamic). Static acres take their class from the acre template, so terrain bytes there are invisible to the game's collision. P2c therefore refuses edits to static-acre tiles.
- Upstream primitives: `TerrainTile.CopyFrom/CopyGroundFrom/CopyRoadFrom/TryRotate` and `TerrainTile.SetArray`.

## Design
### Op and writer (`packages/core/src/map/applyTerrainEdit.ts`)
`TerrainEditOp = { op: "terrainEdit"; label: string; changes: { x: number; y: number; tile: TerrainTileValue }[] }`, with `TerrainTileValue` holding the seven u16 fields. Coordinates are terrain tiles. Duplicate coordinates: the last change wins.
`planTerrainEdit(ctx, op)` is pure and throws a `RangeError` with a human reason on the first violation; it never mutates `ctx`. `writeTerrain` patches only the 14-byte records that changed. Wired into `applyOp`, `describeOp` and the op validation in `edit/ops.ts` like `mapEdit`.

### Strict validity
1. Coordinates inside the layer.
2. Tile is in a dynamic acre (class 7), else refused ("tile is in a fixed acre").
3. Ground triple (unitModel, variation, angle) is in the observed ground set; road triple likewise (road model 0 means no road and requires variation = angle = 0). Elevation is within the observed range for the ground's class.
4. Cross-check: after the edit, every item and building footprint and the plaza that touches an edited tile must still satisfy `groundAt`/`placement` rules; otherwise the whole op is refused and says which one.
The observed set comes from `app/public/data/terrain-observed.json`, produced by `gen:data` from the example save (and any further saves passed to the script). It records each triple with its count and the elevation range per class. The UI states "only combinations seen in real saves".

### Worker and store
`edit/undo/redo` return `touched` terrain tiles (`{x, y, tile}`) alongside item tiles. `mapStore.patchTerrain` writes them into the held `terrain` arrays in place, bumps `version`, and bumps `terrainVersion` so only the terrain layer redraws. The worker caches its parsed map the same way `buildingPlan` does (dropped on load/edit/undo/redo/build).

### UI (new "Terrain" tool)
Tools: Stamp (eyedropper a tile, then paint ground, road, or both), Elevation (+1/-1 within range, a separate tool), Rotate (upstream `TryRotate`: road if present, else ground, never base), Clear road. A stroke is one undoable "Terrain edit". A ghost shows valid/invalid with a reason; a side panel shows the picked tile's fields and observed count. Optional elevation overlay in the viewer. Planning goes through `api.terrainPlan` (no edit) as `buildingPlan` does.

## Verification
- Oracle: `reference/Commands/TerrainEdit.cs` applies the op with upstream's own primitives. A golden test applies seeded random valid ops in both implementations and asserts identical save bytes.
- Unit: every validity rule and cross-check refusal; no-op and duplicate handling; `patchTerrain` (in place, bad index throws and changes nothing, `terrainVersion`); selection/rotation helpers.
- e2e: paint a tile, refuse an invalid one, undo/redo, save, reload, value persisted.
- Plan deviations are recorded as `Ruling:` lines in commit bodies.

## Risks
- The observed set is as wide as the saves scanned. Rare valid tiles are refused until a save containing them is scanned.
- Whether the game accepts a stamped tile next to mismatched neighbours is untested in-game; P2c only guarantees every tile and combination is one the game produced itself.
