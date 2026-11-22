using System.Text.Json;
using NHSE.Reference.Commands;

namespace NHSE.Reference;

public static class Program
{
    public static readonly JsonSerializerOptions Json = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false,
        IncludeFields = true,
    };

    public static int Main(string[] args)
    {
        if (args.Length == 0)
        {
            Console.Error.WriteLine("usage: reference <vectors|dump|save|edit|export-data|map> ...");
            return 2;
        }
        try
        {
            switch (args[0])
            {
                case "vectors": Vectors.Run(args[1]); break;
                case "dump": Dump.Run(args[1], args[2]); break;
                case "save": SaveCmd.Run(args[1], uint.Parse(args[2]), args[3]); break;
                case "edit": Edit.Run(args[1], args[2], uint.Parse(args[3]), args[4]); break;
                case "map": MapDump.Run(args[1], args[2]); break;
                case "item-size": ItemSizeDump.Run(args[1]); break;
                case "export-data": ExportData.Run(args[1]); break;
                default: Console.Error.WriteLine($"unknown command {args[0]}"); return 2;
            }
            return 0;
        }
        catch (Exception e)
        {
            Console.Error.WriteLine(e);
            return 1;
        }
    }

    public static void WriteJson(string path, object value)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path))!);
        File.WriteAllText(path, JsonSerializer.Serialize(value, Json));
    }

    public static void CopyDir(string src, string dst)
    {
        Directory.CreateDirectory(dst);
        foreach (var f in Directory.GetFiles(src))
            File.Copy(f, Path.Combine(dst, Path.GetFileName(f)), true);
        foreach (var d in Directory.GetDirectories(src))
            CopyDir(d, Path.Combine(dst, Path.GetFileName(d)));
    }
}
