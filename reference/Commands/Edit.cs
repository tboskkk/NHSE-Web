using System.Text.Json;
using NHSE.Core;

namespace NHSE.Reference.Commands;

/// <summary>Applies the shared edit-op JSON schema (see packages/core/src/edit/ops.ts) with upstream NHSE.Core, then saves.</summary>
public static class Edit
{
    public static void Run(string saveDir, string opsPath, uint seed, string outDir)
    {
        Program.CopyDir(saveDir, outDir);
        var sav = HorizonSave.FromFolder(outDir);
        using var doc = JsonDocument.Parse(File.ReadAllText(opsPath));
        foreach (var op in doc.RootElement.EnumerateArray())
            Apply(sav, op);
        sav.Save(seed);
    }

    static void Apply(HorizonSave sav, JsonElement op)
    {
        var name = op.GetProperty("op").GetString()!;
        if (name == "batch")
        {
            foreach (var o in op.GetProperty("ops").EnumerateArray()) Apply(sav, o);
            return;
        }
        if (name == "mapEdit")
        {
            MapEdit.Apply(sav, op);
            return;
        }
        if (name == "terrainEdit")
        {
            TerrainEdit.Apply(sav, op);
            return;
        }
        if (name == "buildingEdit")
        {
            BuildingEdit.Apply(sav, op);
            return;
        }
        if (name == "townName")
        {
            var pt = sav.Players[0].Personal;
            var orig = pt.GetTownIdentity().ToArray();
            pt.TownName = op.GetProperty("value").GetString()!;
            sav.ChangeIdentity(orig, pt.GetTownIdentity());
            return;
        }

        var pe = sav.Players[op.GetProperty("player").GetInt32()].Personal;
        uint U(string p = "value") => op.GetProperty(p).GetUInt32();
        switch (name)
        {
            case "wallet": pe.Wallet = pe.Wallet with { Value = U() }; break;
            case "bank": pe.Bank = pe.Bank with { Value = U() }; break;
            case "nookMiles": pe.NookMiles = pe.NookMiles with { Value = U() }; break;
            case "totalNookMiles": pe.TotalNookMiles = pe.TotalNookMiles with { Value = U() }; break;
            case "hotelTickets":
            {
                var d = pe.Data30 is { IsInitialized30: true } a ? a : throw new InvalidOperationException("no hotel data");
                d.HotelTickets = d.HotelTickets with { Value = U() };
                break;
            }
            case "pocketCount": pe.PocketCount = U(); break;
            case "bagCount": pe.BagCount = U(); break;
            case "itemChestCount": pe.ItemChestCount = U(); break;
            case "playerName":
            {
                var orig = pe.GetPlayerIdentity().ToArray();
                pe.PlayerName = op.GetProperty("value").GetString()!;
                sav.ChangeIdentity(orig, pe.GetPlayerIdentity());
                break;
            }
            case "birthday":
            {
                var md = new GSaveDateMD { Month = (byte)U("month"), Day = (byte)U("day") };
                pe.Birthday = md;
                pe.ProfileBirthday = md;
                break;
            }
            case "profileFruit": pe.ProfileFruit = (ushort)U(); break;
            case "setItem":
            {
                var (arr, slot) = Slot(pe, op.GetProperty("area").GetString()!, op.GetProperty("slot").GetInt32());
                arr[slot] = RawItem(op.GetProperty("raw").GetString()!);
                Store(pe, op.GetProperty("area").GetString()!, arr);
                break;
            }
            case "moveItem":
            {
                var f = op.GetProperty("from"); var t = op.GetProperty("to");
                var fa = f.GetProperty("area").GetString()!; var ta = t.GetProperty("area").GetString()!;
                var (fArr, fs) = Slot(pe, fa, f.GetProperty("slot").GetInt32());
                var (tArr, ts) = fa == ta ? (fArr, t.GetProperty("slot").GetInt32()) : Slot(pe, ta, t.GetProperty("slot").GetInt32());
                (fArr[fs], tArr[ts]) = (tArr[ts], fArr[fs]);
                Store(pe, fa, fArr);
                if (fa != ta) Store(pe, ta, tArr);
                break;
            }
            default: throw new InvalidOperationException($"unknown op {name}");
        }
    }

    internal static Item RawItem(string hex)
    {
        var v = Convert.ToUInt64(hex, 16);
        Span<byte> b = stackalloc byte[Item.SIZE];
        System.Buffers.Binary.BinaryPrimitives.WriteUInt64LittleEndian(b, v);
        return Item.GetArray(b)[0];
    }

    static (Item[] arr, int slot) Slot(Personal pe, string area, int slot)
    {
        var arr = (area switch { "pocket" => pe.Pocket, "bag" => pe.Bag, _ => pe.ItemChest }).ToArray();
        if (slot < 0 || slot >= arr.Length) throw new ArgumentOutOfRangeException(nameof(slot));
        return (arr, slot);
    }

    static void Store(Personal pe, string area, Item[] arr)
    {
        switch (area)
        {
            case "pocket": pe.Pocket = arr; break;
            case "bag": pe.Bag = arr; break;
            default: pe.ItemChest = arr; break;
        }
    }
}
