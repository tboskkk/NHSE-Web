# NHSE-Web Sub-project 3a: Map Viewer (P1) — Design

Date: 2026-11-22 · Status: draft for review · Builds on: `2026-11-22-nhse-web-foundation-design.md`

## 1. Goal and scope

The map/terrain editor is the owner's main motivation for this project: a modern editor that avoids the
game's slow in-game terraforming flow. It is split into phases:

| Phase | Content |
|-------|---------|
| **P1 (this spec)** | Read-only map viewer: terrain, field items, buildings, acres; WebGL2 canvas with zoom/pan, hover inspector, layer toggles; sprite-pack import |
| P2 | Editor: brushes, map undo/redo, item placement (own spec) |
| P3 | 3D preview (later) |
| S (parallel track) | Personal sprite pipeline, spike first (section 8) |

### Success criteria
1. Terrain tiles, both field item layers (with flags), buildings and acre layout parse byte-identically to
   upstream `NHSE.Core` (C# oracle golden tests) for the 3.0.3 example save.
2. The viewer renders the whole island and stays interactive (pan/zoom) with the example save.
3. Hover shows tile coordinates, terrain details and item name; layer toggles work.
4. An imported sprite pack is used in preference to bundled menu icons; with no pack the viewer is fully usable.
5. Nothing is written to the save in P1 (viewer is read-only; no dirty state).

### Out of scope for P1
Editing, map undo, 3D preview, sprite generation, room/interior layers, island-level editors.

## 2. Context

- Layout in `main.dat` (`MainSave.cs`, offsets per revision): `LandMakingMap` terrain (7×6 acres × 16×16 tiles,
  14-byte `TerrainTile`: unit model, variation, angle, road model/variation/angle, elevation);
  `FieldItem` two item layers + two flag bitmaps (acres 9×6 since 3.0.0, was 7×6; 32×32 tiles per acre,
  8-byte `Item`); `MainFieldStructure` buildings; `OutsideField` acre base layout.
- Item grid is 2× the terrain resolution (32 vs 16 tiles per acre).
- NHSE's own renderer (`NHSE.Sprites/Field/*`) draws flat per-tile colors; item sprites are not bundled
  upstream (loaded from `%appdata%/NHSE/img`), only 610 menu icons, which the app already ships.
- Item sprites ship nowhere in this repo: they are Nintendo assets and are never redistributed (section 6).

## 3. Architecture

- **Core (`packages/core/src/structures/` + `map/`), pure TS:** `TerrainTile`, field item layers + flags,
  `Building`, acre layout, per-revision offsets and dimensions. Read-only accessors in P1, shaped so P2 can add
  writers. Each structure gets an oracle command in `reference/` and a golden test **before** anything depends on it.
- **Worker:** `api.map()` returns per-layer typed arrays (transferred, not copied). The main thread never
  parses save bytes.
- **Renderer (`app/src/map/`):** PixiJS v8 (WebGL2) scene with terrain, item, building and grid layers. It
  consumes only typed arrays plus a `SpriteSource`. Camera (wheel/pinch zoom, drag pan, clamped to the island)
  and tile↔screen mapping are pure functions with unit tests. Hover inspector and layer toggles live in Svelte.
- **Dependency direction:** UI → renderer → data. The renderer never imports save/worker code.
- **UI placement:** new "Map" section next to the player editor; loaded lazily so the PixiJS bundle does not
  affect initial load of the player editor.

## 4. Terrain visuals

- Flat-color tiles keyed by unit model (Base, River*, Cliff*, Fall*) and elevation, shaded per elevation
  level, over the ocean color (`0xFF80D7C3`). The road layer draws over the base layer. Plaza overlay and
  building footprints (labeled, with icon when available).
- Palette in one table (`terrainPalette.ts`).
- Inspector shows raw unit model, variation, angle, road fields and elevation for the hovered tile.

## 5. Item rendering

- Items draw per 32×32 grid cell from a lazily built texture atlas containing only sprites seen on screen.
- Lookup order: `id_count` → `id_0` → bundled menu icon → generic leaf. Placed-item → held-item remap follows
  upstream `TryGetFieldItemId` (ported, golden-tested via the oracle).

## 6. Sprite-pack import

- "Import sprites" accepts a folder or zip of `NNNNN_V.png` (NHSE naming). Stored in IndexedDB only, never
  uploaded. Status indicator ("sprites: N loaded") and Clear button.
- The repo ships no new Nintendo art. The owner's personal set lives in a git-ignored folder (e.g.
  `personal-sprites/`) and is imported by hand.

## 7. Testing

- Golden tests: each new structure and the item remap against the C# oracle with the example save.
- Unit tests: camera math, tile↔screen mapping, sprite lookup order, pack parsing.
- Playwright: load the example save, open Map, assert non-empty canvas pixels and that hover shows a tile.
  **Verify first** that headless Chromium provides WebGL (SwiftShader); if not, fall back to asserting
  scene-graph state and skip the pixel check.
- Verification items for the plan: PixiJS v8 current API (check docs), `Building` struct layout and building
  count per revision, field item flag semantics.

## 8. Sprite pipeline spike (track S, separate)

Time-boxed spike, no product code: from `~/Games/ACNH/romfs` (zstd archives, BFRES models), decode one model
(e.g. a chair) with its textures and render a top-down or isometric PNG. Output stays in a git-ignored folder.
Success = a recognisable sprite and a go/no-go estimate for the full pipeline. P1 does not depend on S.

## 9. Risks

- PixiJS adds a dependency and bundle weight (mitigated by lazy loading).
- Headless WebGL in CI may be unavailable (fallback in section 7).
- Revision differences in field item dimensions (7→9 acres in 3.0.0): offsets/dimensions must come from the
  revision table, with the example save (3.0.3) as the only verified revision.
