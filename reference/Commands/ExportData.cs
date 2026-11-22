using System.Reflection;
using NHSE.Core;

namespace NHSE.Reference.Commands;

public static class ExportData
{
    static readonly string[] Labels =
    [
        "1.0.0", "1.1.0", "1.1.1", "1.1.2", "1.1.3", "1.1.4", "1.2.0", "1.2.1", "1.3.0", "1.3.1",
        "1.4.0", "1.4.1", "1.4.2", "1.5.0", "1.5.1", "1.6.0", "1.7.0", "1.8.0", "1.9.0", "1.10.0",
        "1.11.0", "1.11.1", "2.0.0", "2.0.1", "2.0.2", "2.0.3", "2.0.4", "2.0.5", "2.0.6", "2.0.7",
        "2.0.8", "3.0.0", "3.0.1", "3.0.2", "3.0.3",
    ];
    static readonly string[] Langs = ["en", "jp", "de", "es", "fr", "it", "ko", "zhs", "zht"];

    static object Region(FileHashRegion h) => new { hashOffset = h.HashOffset, start = h.BeginOffset, length = h.Length };

    static object? HashFile(FileHashInfo info, string name)
    {
        var d = info.GetFile(name);
        return d is null ? null : new { size = d.FileSize, regions = d.HashRegions.Select(Region).ToArray() };
    }

    static object[] Revisions()
    {
        var f = typeof(RevisionChecker).GetField("RevisionInfo", BindingFlags.NonPublic | BindingFlags.Static)!;
        var infos = (FileHeaderInfo[])f.GetValue(null)!;
        if (infos.Length != Labels.Length || RevisionChecker.SizeInfo.Count != Labels.Length)
            throw new InvalidOperationException("revision table length mismatch");

        var result = new object[infos.Length];
        for (int i = 0; i < infos.Length; i++)
        {
            var h = infos[i];
            var sz = RevisionChecker.SizeInfo[i];
            var hash = RevisionChecker.HashInfo[i];
            var po = PersonalOffsets.GetOffsets(h);
            var offs = new SortedDictionary<string, int>(StringComparer.Ordinal);
            foreach (var p in po.GetType().GetProperties().Where(p => p.PropertyType == typeof(int) && p.GetIndexParameters().Length == 0))
                offs[p.Name] = (int)p.GetValue(po)!;

            var mo = MainSaveOffsets.GetOffsets(h);
            result[i] = new
            {
                index = i,
                label = Labels[i],
                header = new { major = h.Major, minor = h.Minor, unk1 = (int)h.Unk1, headerRevision = (int)h.HeaderRevision, unk2 = (int)h.Unk2, saveRevision = (int)h.SaveRevision },
                sizes = new { main = sz.Main, personal = sz.Personal, photoStudioIsland = sz.PhotoStudioIsland, postBox = sz.PostBox, profile = sz.Profile, whereAreN = sz.WhereAreN },
                hash = new Dictionary<string, object?>
                {
                    ["main.dat"] = HashFile(hash, "main.dat"),
                    ["personal.dat"] = HashFile(hash, "personal.dat"),
                    ["postbox.dat"] = HashFile(hash, "postbox.dat"),
                    ["photo_studio_island.dat"] = HashFile(hash, "photo_studio_island.dat"),
                    ["profile.dat"] = HashFile(hash, "profile.dat"),
                    ["wherearen.dat"] = HashFile(hash, "wherearen.dat"),
                },
                personalOffsets = offs,
                mainOffsets = Dump.MainOffsets(mo),
            };
        }
        return result;
    }

    static string[] EnumTable<T>() where T : struct, Enum
    {
        var values = Enum.GetValues<T>();
        var max = values.Max(v => Convert.ToInt32(v));
        var arr = new string[max + 1];
        Array.Fill(arr, "");
        foreach (var v in values)
            arr[Convert.ToInt32(v)] = v.ToString();
        return arr;
    }

    static string[] KindNames(Func<ItemKind, bool> pred) =>
        Enum.GetValues<ItemKind>().Where(pred).Select(k => k.ToString()).ToArray();

    /// <summary>Per-acre 16x16 tile class bytes (outside.bin) plus upstream's resulting colors, for oracle comparison.</summary>
    static void WriteAcreTemplates(string outDir)
    {
        const int count = (int)OutsideAcre.FldOutNGardenRFront00 + 1;
        var classes = new byte[count * 256];
        var colors = new int?[count * 256];
        for (int acre = 0; acre < count; acre++)
        for (int y = 0; y < 16; y++)
        for (int x = 0; x < 16; x++)
        {
            classes[(acre * 256) + (y * 16) + x] = AcreTileColor.AcreTiles[(acre * 32 * 32 * 4) + (4 * ((y * 64) + x))];
            var c = AcreTileColor.GetAcreTileColor((ushort)acre, x, y);
            colors[(acre * 256) + (y * 16) + x] = c == -0x1000000 ? null : c; // opaque black = dynamic (terrain-based)
        }
        File.WriteAllBytes(Path.Combine(outDir, "acretiles.bin"), classes);
        Program.WriteJson(Path.Combine(outDir, "acrecolors.json"), colors);
    }

    public static void Run(string outDir)
    {
        Directory.CreateDirectory(outDir);
        Program.WriteJson(Path.Combine(outDir, "revisions.json"), Revisions());
        WriteAcreTemplates(outDir);

        var en = new GameStrings("en");
        int n = en.itemlistdisplay.Length;
        var kinds = new int[n];
        var icons = new int[n];
        for (int i = 0; i < n; i++)
        {
            kinds[i] = (int)ItemInfo.GetItemKind((ushort)i);
            icons[i] = (int)ItemInfo.GetMenuIcon((ushort)i);
        }

        // remake: valid variant indices per remake-able item id
        var remake = new SortedDictionary<int, object>();
        var remakeIds = new List<ushort>();
        for (int id = 0; id <= ushort.MaxValue; id++)
        {
            var idx = ItemRemakeUtil.GetRemakeIndex((ushort)id);
            if (idx < 0 || !ItemRemakeInfoData.List.TryGetValue(idx, out var info)) continue;
            var body = Enumerable.Range(0, ItemRemakeInfo.BodyColorCountMax).Where(info.HasBodyColor).ToArray();
            var fabric = Enumerable.Range(0, ItemRemakeInfo.BodyColorCountMax).Where(info.HasFabricColor).ToArray();
            remake[id] = new { body, fabric };
            remakeIds.Add((ushort)id);
        }

        var fieldItems = new SortedDictionary<int, object>();
        foreach (var (id, def) in FieldItemList.Items)
            fieldItems[id] = new { name = def.Name, kind = (int)ItemInfo.GetItemKind(id), held = (int)def.HeldItemId };

        var recipes = RecipeList.Recipes.ToDictionary(k => k.Key.ToString(), v => (int)v.Value);

        Program.WriteJson(Path.Combine(outDir, "items.json"), new
        {
            kind = kinds,
            kindNames = EnumTable<ItemKind>(),
            menuIcon = icons,
            menuIconNames = EnumTable<ItemMenuIconType>(),
            kindGroups = new
            {
                furniture = KindNames(k => k.IsFurniture),
                clothing = KindNames(k => k.IsClothing),
                crafting = KindNames(k => k.IsCrafting),
                flower = KindNames(k => k.IsFlower),
                flowerPicked = KindNames(k => k.IsFlowerPicked),
            },
            recipes,
            remake,
            fieldItems,
            flowerGeneNames = Enum.GetValues<FlowerGene>().Where(g => g != FlowerGene.None).ToDictionary(g => g.ToString(), g => (int)g),
        });

        foreach (var lang in Langs)
        {
            var s = new GameStrings(lang);
            var body = new SortedDictionary<int, string[]>();
            var fabric = new SortedDictionary<int, string[]>();
            foreach (var id in remakeIds)
            {
                var info = ItemRemakeInfoData.List[ItemRemakeUtil.GetRemakeIndex(id)];
                body[id] = Enumerable.Range(0, ItemRemakeInfo.BodyColorCountMax).Select(i => info.HasBodyColor(i) ? info.GetBodyDescription(i, s) : "").ToArray();
                fabric[id] = Enumerable.Range(0, ItemRemakeInfo.BodyColorCountMax).Select(i => info.HasFabricColor(i) ? info.GetFabricDescription(i, s) : "").ToArray();
            }
            Program.WriteJson(Path.Combine(outDir, "lang", $"{lang}.json"), new { noneName = s.itemlist[0], items = s.itemlistdisplay, remakeBody = body, remakeFabric = fabric });
        }
    }
}
