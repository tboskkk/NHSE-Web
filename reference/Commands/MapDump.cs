using NHSE.Core;

namespace NHSE.Reference.Commands;

/// <summary>Dumps the map structures (terrain, field items, buildings, acres, plaza) read by upstream NHSE.Core.</summary>
public static class MapDump
{
    public static void Run(string saveDir, string outFile)
    {
        var sav = HorizonSave.FromFolder(saveDir);
        var main = sav.Main;
        var mapSave = main;

        var tiles = mapSave.GetTerrainTiles();
        var l0 = mapSave.GetFieldItemLayer0();
        var l1 = mapSave.GetFieldItemLayer1();
        var accWidth = mapSave.FieldItemAcreWidth;

        Program.WriteJson(outFile, new
        {
            terrain = new
            {
                width = 7 * 16,
                height = 6 * 16,
                tiles = tiles.Select(t => new
                {
                    unitModel = (int)t.UnitModel,
                    variation = (int)t.Variation,
                    angle = (int)t.LandMakingAngle,
                    roadModel = (int)t.UnitModelRoad,
                    roadVariation = (int)t.VariationRoad,
                    roadAngle = (int)t.LandMakingAngleRoad,
                    elevation = (int)t.Elevation,
                }).ToArray(),
            },
            items = new
            {
                acreWidth = (int)accWidth,
                acreHeight = (int)mapSave.FieldItemAcreHeight,
                width = accWidth * 32,
                height = mapSave.FieldItemAcreHeight * 32,
                layer0 = l0.Select(i => i.RawValue.ToString("x16")).ToArray(),
                layer1 = l1.Select(i => i.RawValue.ToString("x16")).ToArray(),
                // Raw flag regions exactly as stored (upstream builds its flag layer with acre counts, so the
                // per-tile meaning is not reliable; the viewer treats these bytes as opaque).
                flag0 = Convert.ToHexString(mapSave.FieldItemFlag0Data.ToArray()).ToLowerInvariant(),
                flag1 = Convert.ToHexString(mapSave.FieldItemFlag1Data.ToArray()).ToLowerInvariant(),
            },
            buildings = mapSave.Buildings.Select(b => new
            {
                type = (int)b.BuildingType,
                x = (int)b.X,
                y = (int)b.Y,
                angle = (int)b.Angle,
                bit = (int)b.Bit,
                subType = (int)b.Type,
                typeArg = (int)b.TypeArg,
                uniqueId = (int)b.UniqueID,
            }).ToArray(),
            acres = Enumerable.Range(0, 9 * 8).Select(i => (int)mapSave.GetAcre(i)).ToArray(),
            plaza = new { x = mapSave.EventPlazaLeftUpX, z = mapSave.EventPlazaLeftUpZ },
        });
    }
}
