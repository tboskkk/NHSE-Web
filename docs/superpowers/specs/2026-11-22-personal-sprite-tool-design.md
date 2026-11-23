# Personal sprite tool (design)

Productises spike S (`scripts/spike-s/`, verified on 8 chairs). Offline CLI: your own ACNH romfs dump in, `personal-sprites/NNNNN_V.png` out, ready for the Map page's "Import folder/.zip". Output is Nintendo-derived art: git-ignored, never committed, never uploaded.

## Goal and success
`bun run gen:sprites --romfs ~/Games/ACNH/romfs` renders every `Ftr*` item that has `ReBody` variants into a top-down, albedo-only sprite. Success: `importPack` accepts the folder with zero skips; sprites draw at the right size on the Map page (which stretches each sprite over the item footprint rectangle, `itemSpriteRect`); a sample of chairs, tables and beds is recognisable; unsupported items are skipped and listed, never crash the run.

## Decisions (agreed)
- Stack: TypeScript on bun. Only BFRES parsing is C# (a small dump helper reusing the spike's BfresLibrary code); everything else is TS.
- Fidelity v1: top-down, albedo (`_Alb`), no lighting, transparent background. Renderer is structured so a normal-based light can be added later.
- Scale: fixed 32 px per item tile; canvas is footprint-shaped (w x h tiles from core `itemFootprint`), model centred in it. A model larger than its footprint is scaled down uniformly to fit; smaller is left at real scale. No Map page change.
- Out of scope: lighting, non-Ftr items (clothes, flowers, trees, tools, NPCs), per-material texture choice, fabric/pattern variants, rotation (sprite is orientation 0), Normal/Mix maps.

## Units (`scripts/sprites/`)
1. `romfs.ts`: parse `Bcsv/ItemParam.bcsv` (hash-named columns; id = column `0x54706054`, model = the `FtrXxx` column) into `{id, model, variants[]}`; variants = existing `Model/<model>ReBody<V>.Nin_NX_NVN.zs`. Footprint comes from `@nhse/core`.
2. `container.ts`: zstd (Bun built-in) and SARC reader.
3. `bfres-dump/` (C#) + `bfres.ts`: invoke helper, get JSON `{shapes:[{material, pos, uv, idx}]}` plus external texture names. Built once (`dotnet build`), run per model batch.
4. `bntx.ts`: header parse, Tegra block-linear deswizzle, BC1 to RGBA.
5. `raster.ts`: pure z-buffer top-down rasteriser: `(shapes, texture, footprint, pxPerTile) -> RGBA`.
6. `png.ts`: RGBA to PNG (small encoder or existing dependency).
7. `cli.ts`: flags `--romfs`, `--out` (default `personal-sprites`), `--only <id|name>`, `--jobs`. Skips existing files (resumable). Writes `report.json` with a skip reason per item.

## Errors
Per-item failures (missing texture, unsupported BNTX format, empty mesh) are caught, recorded as skipped with a reason, and the run continues. Non-zero exit only if the romfs or ItemParam is unreadable or the C# helper is not built.

## Testing (TDD)
- Unit tests on synthetic fixtures built in-test (tiny SARC, a BC1 block swizzled by an independent reference encoder, a two-triangle mesh). No Nintendo bytes committed.
- Rasteriser: coverage, z-order, centring, downscale-to-fit.
- Romfs-gated integration test (`NHSE_TEST_ROMFS`, skipped when unset): render one known chair, assert PNG size = footprint x 32, alpha coverage > 0, filename accepted by `parsePackName`/`importPack`. No comparison against committed art.

## Verification beyond tests
Run over all items, report counts (rendered / skipped by reason), eyeball a contact sheet of a sample, import the folder in the app.

## Assumptions to confirm in the plan
- `@nhse/core` `itemFootprint` is importable from scripts and its size data covers Ftr ids (unknownSize items fall back to the model bounding box, rounded up to tiles).
- A single `_Alb` texture per variant is enough for the majority of models; multi-material models use the first `_Alb` (spike behaviour); the report counts how many had several.
- Rendering thousands of models in TS is fast enough with `--jobs`; measured in the plan.

## Later (own brainstorms)
Villagers and collections sprites; shading; rotation; non-Ftr item classes.
