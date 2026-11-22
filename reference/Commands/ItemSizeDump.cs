using NHSE.Core;

namespace NHSE.Reference.Commands;

/// <summary>Upstream tile width/height of every item id for each rotation 0-3 (flat [w,h] pairs, id-major then rotation).</summary>
public static class ItemSizeDump
{
    public static void Run(string outFile)
    {
        var o = new List<int>(65536 * 4 * 2);
        for (int id = 0; id <= ushort.MaxValue; id++)
            for (int rot = 0; rot < 4; rot++)
            {
                var item = new Item((ushort)id) { SystemParam = (byte)rot };
                // upstream indexes ItemSizes[id] after `id > Length`, so id == Length throws; treat as Unknown
                ItemSizeType type;
                try { type = ItemInfo.GetItemSize(item); } catch (IndexOutOfRangeException) { type = ItemSizeType.Unknown; }
                int w = type.Width, h = type.Height;
                if ((item.Rotation & 1) == 1) (w, h) = (h, w);
                o.Add(w); o.Add(h);
            }
        Program.WriteJson(outFile, o.ToArray());
    }
}
