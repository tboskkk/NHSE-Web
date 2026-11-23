using System.Text.Json;
using NHSE.Core;

namespace NHSE.Reference.Commands;

/// <summary>`buildingEdit` op (see packages/core/src/map/applyBuildingEdit.ts) applied with upstream's Building primitives.</summary>
public static class BuildingEdit
{
    public static void Apply(HorizonSave sav, JsonElement op)
    {
        var main = sav.Main;
        var list = main.Buildings.ToArray();
        foreach (var c in op.GetProperty("changes").EnumerateArray())
        {
            var j = c.GetProperty("building");
            var b = list[c.GetProperty("slot").GetInt32()];
            var type = (BuildingType)j.GetProperty("type").GetUInt16();
            if (type == 0) { b.Clear(); continue; }
            b.BuildingType = type;
            b.X = j.GetProperty("x").GetUInt16();
            b.Y = j.GetProperty("y").GetUInt16();
            b.Angle = j.GetProperty("angle").GetByte();
            b.Bit = j.GetProperty("bit").GetSByte();
            b.Type = j.GetProperty("subType").GetUInt16();
            b.TypeArg = j.GetProperty("typeArg").GetByte();
            b.UniqueID = j.GetProperty("uniqueId").GetUInt16();
        }
        main.Buildings = list;
        if (op.TryGetProperty("plaza", out var p))
        {
            main.EventPlazaLeftUpX = p.GetProperty("x").GetUInt32();
            main.EventPlazaLeftUpZ = p.GetProperty("z").GetUInt32();
        }
    }
}
