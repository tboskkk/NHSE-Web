using NHSE.Core;

namespace NHSE.Reference.Commands;

public static class Vectors
{
    static string Hex(ReadOnlySpan<byte> b) => Convert.ToHexString(b).ToLowerInvariant();

    public static void Run(string outPath)
    {
        var rng = new Random(12345);
        byte[] Rand(int n) { var b = new byte[n]; rng.NextBytes(b); return b; }

        // murmur3 (length must be a multiple of 4)
        var murmur = new List<object>();
        foreach (var len in new[] { 0, 4, 8, 12, 64, 100, 1024, 0x1000 })
        {
            var d = Rand(len);
            murmur.Add(new { hex = Hex(d), hash = Murmur3.Hash(d) });
        }

        // EncryptedInt32
        var encInt = new List<object>();
        var cases = new (uint v, byte s, ushort a)[]
        {
            (0, 0, 0), (1, 0, 0), (99999, 5, 0x1234), (12345, 31, 0xFFFF), (uint.MaxValue, 7, 1),
            (999_999_999, 0, 0xFFFF), (4321, 31, 0), (50000, 13, 0x00AB),
        };
        foreach (var (v, s, a) in cases)
        {
            var enc = EncryptedInt32.Encrypt(v, s, a);
            encInt.Add(new { value = v, shift = (int)s, adjust = (int)a, encrypted = enc, checksum = (int)EncryptedInt32.CalculateChecksum(enc) });
        }

        // Encryption through the public Encrypt API
        var encryption = new List<object>();
        foreach (var (seed, len) in new[] { (305419896u, 16), (1u, 0x1000), (0xFFFFFFFFu, 1000), (42u, 33) })
        {
            var data = Rand(len);
            var version = Rand(0x300); // only first 0x100 are used
            var res = Encryption.Encrypt(data, seed, version);
            encryption.Add(new
            {
                seed,
                versionHeaderHex = Hex(version.AsSpan(0, 0x100)),
                dataHex = Hex(data),
                outHeaderHex = Hex(res.Header.Span),
                outDataHex = Hex(res.Data.Span),
            });
        }

        Program.WriteJson(outPath, new { murmur3 = murmur, encInt, encryption });
    }
}
