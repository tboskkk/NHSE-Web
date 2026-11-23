using System.Text.Json;
using NHSE.Core;

namespace NHSE.Reference.Commands;

/// <summary>`terrainEdit` op (see packages/core/src/map/applyTerrainEdit.ts) applied with upstream's TerrainTile primitives.</summary>
public static class TerrainEdit
{
    const int Height = 96; // terrain is column-major: index = Height * x + y

    public static void Apply(HorizonSave sav, JsonElement op)
    {
        var main = sav.Main;
        var tiles = main.GetTerrainTiles();
        foreach (var c in op.GetProperty("changes").EnumerateArray())
        {
            var cur = tiles[Height * c.GetProperty("x").GetInt32() + c.GetProperty("y").GetInt32()];
            if (c.TryGetProperty("rotate", out var r) && r.GetBoolean())
            {
                cur.TryRotate();
                continue;
            }
            var j = c.GetProperty("tile");
            var src = new TerrainTile
            {
                UnitModel = (TerrainUnitModel)j.GetProperty("unitModel").GetUInt16(),
                Variation = j.GetProperty("variation").GetUInt16(),
                LandMakingAngle = j.GetProperty("angle").GetUInt16(),
                UnitModelRoad = (TerrainUnitModel)j.GetProperty("roadModel").GetUInt16(),
                VariationRoad = j.GetProperty("roadVariation").GetUInt16(),
                LandMakingAngleRoad = j.GetProperty("roadAngle").GetUInt16(),
                Elevation = j.GetProperty("elevation").GetUInt16(),
            };
            cur.CopyGroundFrom(src);
            cur.CopyRoadFrom(src);
            cur.Elevation = src.Elevation;
        }
        main.SetTerrainTiles(tiles);
    }
}
