# Spike S: personal sprite pipeline (THROWAWAY, uncommitted code)

Turns a furniture model from your own ACNH romfs dump (`~/Games/ACNH/romfs`) into a top-down `NNNNN_V.png`
in git-ignored `personal-sprites/`, which the Map page's "Import folder/.zip" accepts. Never commit the output (Nintendo art).

Run everything from the repo root with `export DOTNET_ROOT=~/.dotnet PATH=~/.dotnet:$PATH`.

1. Build the two C# helpers (BfresLibrary NuGet needs network once):
   `dotnet build scripts/spike-s/bf/bf -c Release` and `dotnet build scripts/spike-s/bcsv/d -c Release`
2. Dump the item table (hashed column headers): `dotnet run -c Release --no-build --project scripts/spike-s/bcsv/d -- ~/Games/ACNH/romfs/Bcsv/ItemParam.bcsv scripts/spike-s/bcsv/ItemParam.tsv`
3. Find id + model name: `python3 scripts/spike-s/pick2.py scripts/spike-s "tubular chair"` -> `770 tubular chair FtrWireChairS`
4. Render: `scripts/spike-s/item2sprite.sh 770 FtrWireChairS 3` (id, model, variant) -> `personal-sprites/00770_3.png`
   (also leaves `<id>_<v>_iso.png` next to the script's work dir; work files in `scripts/spike-s/w/`).

How it works (verified on 8 chairs): item id is the `0x54706054` column of ItemParam (row order is NOT the id); model name is the
plain `FtrXxx` column; `Model/<name>.Nin_NX_NVN.zs` = zstd -> SARC (`sarc.py`) -> BFRES (`bf`, BfresLibrary) with mesh;
`<name>ReBody<V>.Nin_NX_NVN.zs` holds only the variant-V textures (BNTX, Tegra block-linear + BC1: `bntx.py`/`render.py`).
Software z-buffer rasteriser in `render.py` (top and iso views, albedo only, no lighting).

Not covered: items without ReBody files beyond one test, fabric/pattern variants and per-material texture choice, non-`Ftr` items
(clothes, flowers, trees, tools, NPCs), multi-tile footprints/orientation, lighting/normal/Mix maps.
