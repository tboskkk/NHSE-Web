using NHSE.Core;

namespace NHSE.Reference.Commands;

public static class Dump
{
    public static object ItemDump(Item i, GameStrings s) => new { raw = i.RawValue.ToString("x16"), name = s.GetItemName(i) };

    public static object PlayerDump(Player p, GameStrings s)
    {
        var pe = p.Personal;
        uint? hotel = pe.Data30 is { IsInitialized30: true } a ? a.HotelTickets.Value : null;
        return new
        {
            directory = p.DirectoryName,
            playerName = pe.PlayerName,
            townName = pe.TownName,
            playerId = pe.PlayerID,
            townId = pe.TownID,
            wallet = pe.Wallet.Value,
            bank = pe.Bank.Value,
            nookMiles = pe.NookMiles.Value,
            totalNookMiles = pe.TotalNookMiles.Value,
            hotelTickets = hotel,
            pocketCount = pe.PocketCount,
            bagCount = pe.BagCount,
            itemChestCount = pe.ItemChestCount,
            birthday = new { month = (int)pe.Birthday.Month, day = (int)pe.Birthday.Day },
            profileBirthday = new { month = (int)pe.ProfileBirthday.Month, day = (int)pe.ProfileBirthday.Day },
            profileFruit = (int)pe.ProfileFruit,
            // NHSE naming: "Pocket" = slots 1-20 (Pockets2), "Bag" = slots 21-40 (Pockets1)
            pocket = pe.Pocket.Select(i => ItemDump(i, s)).ToArray(),
            bag = pe.Bag.Select(i => ItemDump(i, s)).ToArray(),
            itemChest = pe.ItemChest.Select(i => ItemDump(i, s)).ToArray(),
        };
    }

    public static void Run(string saveDir, string outDir)
    {
        var sav = HorizonSave.FromFolder(saveDir);
        var s = new GameStrings("en");
        var files = new List<object>();

        void Emit(string dir, EncryptedFilePair pair)
        {
            var rel = dir.Length == 0 ? pair.NameData : $"{dir}/{pair.NameData}";
            var relH = dir.Length == 0 ? pair.NameHeader : $"{dir}/{pair.NameHeader}";
            var full = Path.Combine(outDir, "decrypted", rel);
            Directory.CreateDirectory(Path.GetDirectoryName(full)!);
            File.WriteAllBytes(full, pair.Data.ToArray());
            File.WriteAllBytes(Path.Combine(outDir, "decrypted", relH), pair.Header.ToArray());
            files.Add(new
            {
                path = rel,
                size = pair.Data.Length,
                invalidHashes = pair.InvalidHashes().Select(h => new { hashOffset = h.HashOffset, start = h.BeginOffset, length = h.Length }).ToArray(),
            });
        }

        Emit("", sav.Main);
        foreach (var p in sav.Players)
            foreach (var pair in p)
                Emit(p.DirectoryName, pair);

        Program.WriteJson(Path.Combine(outDir, "summary.json"), new
        {
            revisionIndex = sav.Main.Info.GetKnownRevisionIndex(),
            files,
            players = sav.Players.Select(p => PlayerDump(p, s)).ToArray(),
        });
    }
}
