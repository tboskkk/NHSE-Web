using System.Text.Json;
using NHSE.Core;

namespace NHSE.Reference.Commands;

/// <summary>`mapEdit` op (see packages/core/src/map/applyMapEdit.ts) applied with upstream's own item/extension primitives.</summary>
public static class MapEdit
{
    public static void Apply(HorizonSave sav, JsonElement op)
    {
        var main = sav.Main;
        int layerIndex = op.GetProperty("layer").GetInt32();
        var tiles = layerIndex == 0 ? main.GetFieldItemLayer0() : main.GetFieldItemLayer1();
        var layer = new LayerFieldItem(tiles, (byte)main.FieldItemAcreWidth, (byte)main.FieldItemAcreHeight);
        int W = layer.TileInfo.TotalWidth, H = layer.TileInfo.TotalHeight;

        // erase the whole item covering (x, y): find its root through extension offsets, then upstream delete calls
        void EraseAt(int x, int y)
        {
            if (x < 0 || y < 0 || x >= W || y >= H) return;
            var t = layer.GetTile(x, y);
            if (t.IsNone) return;
            if (t.IsExtension)
            {
                int rx = x - t.ExtensionX, ry = y - t.ExtensionY;
                var root = rx >= 0 && ry >= 0 && rx < W && ry < H ? layer.GetTile(rx, ry) : null;
                if (root == null || root.IsNone || root.IsExtension || root.ItemId != t.ExtensionItemId) { t.Delete(); return; } // orphan
                layer.DeleteExtensionTiles(root, rx, ry);
                root.Delete();
                return;
            }
            layer.DeleteExtensionTiles(t, x, y);
            t.Delete();
        }

        foreach (var c in op.GetProperty("changes").EnumerateArray())
        {
            int x = c.GetProperty("x").GetInt32(), y = c.GetProperty("y").GetInt32();
            var item = Edit.RawItem(c.GetProperty("raw").GetString()!);
            if (item.IsNone) { EraseAt(x, y); continue; }
            var size = ItemInfo.GetItemSize(item);
            int w = size.Width, h = size.Height;
            if ((item.Rotation & 1) == 1) (w, h) = (h, w);
            for (int ix = 0; ix < w; ix++) for (int iy = 0; iy < h; iy++) EraseAt(x + ix, y + iy);
            layer.SetTile(x, y, item);
            layer.SetExtensionTiles(item, x, y);
        }

        if (layerIndex == 0) main.SetFieldItemLayer0(layer.Tiles); else main.SetFieldItemLayer1(layer.Tiles);
    }
}
