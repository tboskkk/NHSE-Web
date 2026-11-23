# Map 3D natural-item models (design)

Sub-project 3 of the 3D editor (after the read-only viewer and 3D editing). Placed trees, bushes, flowers, weeds, vegetables and stumps draw as the real game models in the 3D view, from the user's own romfs dump. Output is Nintendo-derived art: git-ignored, never committed, never uploaded. No furniture or villagers.

## Spike findings this design rests on (spike P, throwaway, scratchpad only)
- Each `Plt*` model file is one BFRES holding several models, one per growth stage: oak `PltTreeOak0..4` plus `...Stump` per stage; cosmos `PltFlwCosmos0..2` and `Seedling`; bushes `PltBushAzalea0..4`. `...Node` models are skinned copies for wind animation. Stage models are rigid (no skinning), with `_p0` positions, `_n0` normals, `_u0` UVs; shadow meshes (`mShadow`, `mShadowShake`) have no textures.
- `Bcsv/FgMainParam.bcsv` (hashed headers, dumpable with the existing helper) has one row per field item (540 rows = `items.json` `fieldItems`): column `0x87BF00E8` item name (matches `fieldItems[id].name`), `0x39B5A93D` model name, `0x48EF0398` file name, `0x64B8FFF8` colour index (cosmos: white 0, pink 1, red 2, orange 3, yellow 4, black 5, matching the ramp rows). Fruit trees reuse the oak models.
- Textures per material: `*_AlbGry` (BC4 grey albedo), `*_OP` (BC4 opacity), `*_Mix` (BC1), `*_Nrm` (BC5), and `*Color*_Grd` colour ramps (RGBA8 sRGB; rows are colours or, for leaves and trunks, seasons). Colour = ramp[row][x = grey]. Verified visually on oak (stages 3, 4), cosmos (red, white) and azalea (white, pink).
- Size: oak stage 4 is about 4k vertices; a full export is estimated at 8-10 MB (to be measured).

## Goal and success
`bun run gen:models --romfs ~/Games/ACNH/romfs` writes a git-ignored `personal-models/` pack. Importing it in the Map page (same "Import folder/.zip" button) makes the 3D view draw every item that has a model as that model in summer colours, lit, with alpha-cut leaves and petals; items without a model keep today's icons or sprites. Success: oak trees at each growth stage, fruit trees, cosmos in each colour, bushes, weeds and stumps on the example island look like the game's; orbiting stays smooth; all 3D edit tools, picking and ghosts work unchanged.

## Decisions
- Scope v1: every field item `FgMainParam` maps to a `Plt*` file, stage models and stumps. Out: `Node`/`Anim` models, snow variants, shadow meshes, non-`Plt` items (fences, rocks, shells), fruit on trees, wind animation, seasons.
- Season: fixed summer (one constant row per leaf/trunk ramp, tuned by eye, in one constants file). A selector is a later sub-project.
- Baking: each (model, colour index) pair gets one baked RGBA texture (grey albedo through the ramp row, alpha from `_OP`); no shader work in the browser.
- Weeds with `A/B/C` meshes use variant A in v1.
- Pack: `models.json` (`items`: item id -> model key; `models`: key -> {geometry file, texture file, bounds}) + one little-endian binary geometry file per model (positions, normals, uvs as float32/uint16, u16/u32 indices) + one baked PNG per texture. Import detects a pack by `models.json`; stored in IndexedDB beside the sprite pack; "Clear" removes both.
- App rendering: one `InstancedMesh` per model key (`MeshLambertMaterial`, `alphaTest`), instance transform = footprint centre on the ground, no rotation, uniform scale `MODEL_UNITS_PER_TILE` calibrated against known footprints; billboard fallback untouched for items without a model.
- Picking: unchanged (tile based); model instances are not ray targets in v1, so the ground tile under a tree is picked.

## Units
- `scripts/models/` (TS): `fgmain.ts` (parse the dumped TSV to `name -> {file, model, colour}`), `bake.ts` (ramp bake), `pack.ts` (write the pack), `cli.ts` (`--romfs`, `--out personal-models`, `--only`, `--jobs`, report beside the output as `<out>.report.json`); `scripts/sprites/bntx.ts` gains `decodeBc4`/`decodeRgba8`.
- `scripts/sprites/dotnet/Program.cs` gains `bfres-models <in.bfres> <out.json>` (per-model shapes with material name, positions, normals, UVs, indices, skin flag).
- `app/src/map3d/modelPack.ts`: parse/import/store the pack; `app/src/map3d/modelGroups.ts` (pure): item raws to instances per model key; `scene3d.ts`: draw them; `MapSection.svelte`: the import button also accepts model packs.

## Errors
Per-item failures (missing texture, unknown format, empty mesh) are recorded in the report and skipped; the run continues. A bad or partial pack in the browser is reported ("n models skipped") and the rest still load; WebGL/texture failures skip that model key only.

## Testing (TDD)
- Unit (synthetic fixtures built in-test): BC4 decode (both 8-value and 6-value modes), RGBA8 deswizzle, ramp bake (row and column lookup, alpha threshold), `FgMainParam` parse (hashed headers, NUL padding, duplicate names), pack write/read round-trip, `modelGroups` grouping by key with the right ground height and fallback to billboards when the key is missing.
- Romfs-gated golden (`NHSE_TEST_ROMFS`): generate oak and cosmos into a temp pack; assert manifest entries for known ids, vertex counts > 0, texture not uniform, deterministic output on a second run.
- Gated e2e: import that pack on the example save, open 3D, canvas differs from the icon-only picture; Clear restores it.
- Measurement step: full-export pack size and import time recorded in the handoff.

## Out of scope
Season selector, snow models, animation, fruit, rocks and shells, fences, 2D use of models, picking by model, villagers, furniture.

## Roadmap (own specs)
Season selector (ramp rows by month, snow variants) and the date from the save; fences, rocks, shells and other non-`Plt` natural items; acres only if the save allows safe swaps.

## Assumptions to confirm in the plan
- A summer row per leaf/trunk ramp can be chosen by eye; leaf ramp row semantics are otherwise undecoded.
- `MODEL_UNITS_PER_TILE` for plants matches the furniture scale (5 model units per tile) or is calibrated separately.
- The pack stays within a few MB per export; measured at the end.
