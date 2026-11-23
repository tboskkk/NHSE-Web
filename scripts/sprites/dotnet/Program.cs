// Two formats the TS tool does not port: BCSV (hashed-header tables) and BFRES (Switch models).
//   bcsv <in.bcsv> <out.tsv>   dump a BCSV as TSV (upstream NHSE.Parsing)
//   bfres <in.bfres> <outDir>  write outDir/model.json {shapes:[{name,mat,pos,uv,idx}]} (LOD 0, all models) and every embedded file
using System.Text.Json;
using BfresLibrary;
using NHSE.Parsing;

if (args.Length != 3) { Console.Error.WriteLine("usage: bcsv <in> <out.tsv> | bfres <in> <outDir>"); return 2; }
switch (args[0])
{
    case "bcsv":
        BCSVConverter.Dump(args[1], args[2]);
        return 0;
    case "bfres":
        var rf = new ResFile(args[1]);
        Directory.CreateDirectory(args[2]);
        foreach (var kv in rf.ExternalFiles) File.WriteAllBytes(Path.Combine(args[2], kv.Key), kv.Value.Data);
        var shapes = new List<object>();
        foreach (var m in rf.Models.Values)
        {
            foreach (var s in m.Shapes.Values)
            {
                var helper = new BfresLibrary.Helpers.VertexBufferHelper(m.VertexBuffers[s.VertexBufferIndex], rf.ByteOrder);
                float[] pos = Array.Empty<float>(), uv = Array.Empty<float>();
                foreach (var a in helper.Attributes)
                {
                    if (a.Name == "_p0") pos = a.Data.SelectMany(v => new[] { v.X, v.Y, v.Z }).ToArray();
                    if (a.Name == "_u0") uv = a.Data.SelectMany(v => new[] { v.X, v.Y }).ToArray();
                }
                var mesh = s.Meshes[0];
                var idx = mesh.GetIndices().Select(i => (uint)i + mesh.FirstVertex).ToArray();
                shapes.Add(new { name = s.Name, mat = m.Materials[s.MaterialIndex].Name, pos, uv, idx });
            }
        }
        File.WriteAllText(Path.Combine(args[2], "model.json"), JsonSerializer.Serialize(new { shapes }));
        return 0;
    default:
        Console.Error.WriteLine($"unknown command {args[0]}");
        return 2;
}
