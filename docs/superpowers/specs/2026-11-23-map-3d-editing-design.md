# Map 3D editing (design)

Sub-project 2 of the 3D editor (after the read-only 3D viewer, `2026-11-23-map-3d-viewer-design.md`). Click in the 3D view to edit the real save with every existing tool: item place/erase/fill/clear/pick, buildings and plaza, and the terrain brush. Style reference is Island Planner (left-click place, orbit camera); our own code. No furniture or villagers, no acre swaps.

## Goal and success
In 3D, Edit mode works exactly as in 2D: same tools, same validation rules and refusal reasons, same ops, same shared undo/redo and Save, same toolbar and panels. Success: in 3D you can place and erase an item, drag-fill an area, move a building, stamp a terrain tile and raise/lower elevation; each shows live in the 3D scene, undoes and redoes, and survives save and reload; refused edits show their reason; nothing about 2D editing changes.

## Decisions
- Reuse, not copy: `MapView3D` takes the same interaction props as the 2D `MapView` (`paint`, `ghost`, `paintGrid`, `onhover`); `MapSection` passes them to whichever view is shown. All tool logic (`tools.ts`, `buildingTool.ts`, `terrainTool.ts`, ops, planners) is untouched.
- Picking: pointer -> ray -> first hit among upright item billboards (instances map back to their footprint root tile), then the terrain mesh, then the water plane (open sea). The hit's world x/z becomes an item tile (layer origin from the acre count, z origin 32) and a terrain tile (112 x 96 grid, world offset 32 units, 2 units per tile); each is null outside its grid, as 2D `screenToTile`. `paintGrid` chooses which tile feeds `paint`; `onhover` always reports both.
- Strokes behave as in 2D: tiles are reported on every pointer move; the tool batches them into one undoable op at stroke end; second finger or lost pointer cancels.
- Ghost: translucent green (ok) / red (refused) rectangle draped on the ground over the footprint at the highest ground height under it plus a small offset; the label (refusal reason or item name) shows as a caption under the canvas, not as 3D text. The terrain tool's single-tile ghost uses the same path.
- Controls in Edit mode: left button or one finger paints; right-drag orbits; middle-drag or Space-drag pans; scroll zooms; two fingers orbit/pan/zoom. View mode keeps the viewer's controls. WASD, R/F and G stay.
- Live updates: the viewer's `MapStore` version subscriptions already refresh terrain, structures and items; the terrain mesh is rebuilt once per committed stroke. If the rebuild is measurably slow (> 50 ms on the example save), height changes are patched incrementally instead (decided in the plan from the measurement).
- Layer checkboxes (terrain, both item layers, buildings, acre grid) apply to 3D; the 3D acre grid follows the `grid` checkbox as well as the G key.
- Edit mode, tool, brush and panels persist when switching between 2D and 3D; the "Switch to 2D to edit" block is removed.
- Test hook: the 3D host element exposes `projectTile(x: number, y: number): {x: number; y: number} | null` (item tile -> canvas px) so e2e can click exact tiles without camera maths.

## Units (`app/src/map3d/`)
1. `pick.ts` (pure): `worldToItemTile`, `worldToTerrainTile` (inverse of the viewer's coordinates), `footprintHeight(field, x, z, w, h)`, and `ghostGeometry(ghost, field, originX)` for the draped rectangle.
2. `controlsMode.ts` (pure): maps (editing: boolean, input kind) to the OrbitControls button/touch configuration.
3. `scene3d.ts`: adds raycasting (billboards, terrain, water), the ghost mesh, `projectTile`, control reconfiguration, layer visibility, grid sync.
4. `MapView3D.svelte`: new props `paint`, `ghost`, `paintGrid`, `onhover`, `layers`; pointer handling mirrors `MapView.svelte` (down/move/up/cancel, Space-pan, pinch).
5. `MapSection.svelte`: pass the props to 3D, drop the 3D edit block, show the ghost caption under the 3D canvas.

## Errors
A pointer that leaves the canvas or loses capture cancels the stroke (as 2D). A pick that misses everything reports null (ghost hidden). Refused edits go through the existing refusal path unchanged.

## Testing (TDD)
- Unit (bun): world<->tile conversions round-trip the viewer's placement for 7- and 9-acre item layers; null outside grids; `footprintHeight` returns the max ground height under a footprint; ghost geometry hugs a raised tile; `controlsMode` returns paint-left/orbit-right in edit and orbit-left in view.
- Playwright e2e (`NHSE_TEST_SAVE`): 3D + Edit: place an item via `projectTile`, status shows the edit and the canvas changes; undo restores; fill an area; stamp a terrain tile (terrain mesh redraw verified by screenshot difference); a refused placement shows its reason caption; 2D editing e2e still passes; save and reload keeps the 3D edits.
- Measurement step in the plan: time a terrain rebuild on the example save and record it.

## Out of scope
Picking items hidden behind taller ones, elevation overlays, the dimmed non-edited item layer, an inspector for 3D, acre swaps, furniture, villagers, 3D models.

## Roadmap (own specs)
3. Natural-item models from the user's romfs (trees, bushes, flowers, weeds), billboard fallback. 4. Acres, only if the save allows safe swaps.

## Assumptions to confirm in the plan
- Instanced billboard picking via Raycaster on `InstancedMesh` is accurate and fast enough; if not, picking falls back to the ground tile behind it.
- `OrbitControls` can be reconfigured at runtime (`mouseButtons`, `touches`) without recreating it.
