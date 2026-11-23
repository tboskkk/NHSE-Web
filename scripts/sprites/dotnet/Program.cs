// Two formats the TS tool does not port: BCSV (hashed-header tables) and BFRES (Switch models).
//   bcsv <in.bcsv> <out.tsv>   dump a BCSV as TSV (upstream NHSE.Parsing)
//   bfres-models <in.bfres> <outDir>  write outDir/models.json {models:[{name,materials:[{name,textures}],shapes:[{name,mat,skin,pos,nrm,uv,idx}]}]} (LOD 0) and every embedded file
//   bfres <in.bfres> <outDir>  write outDir/model.json {shapes:[{name,mat,pos,uv,idx}]} (LOD 0, all models) and every embedded file
using System.Text.Json;
using BfresLibrary;
using NHSE.Parsing;

if (args.Length != 3) { Console.Error.WriteLine("usage: bcsv <in> <out.tsv> | bfres <in> <outDir> | bfres-models <in> <outDir>"); return 2; }
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
    case "bfres-models":
        var rf2 = new ResFile(args[1]);
        Directory.CreateDirectory(args[2]);
        foreach (var kv in rf2.ExternalFiles) File.WriteAllBytes(Path.Combine(args[2], kv.Key), kv.Value.Data);
        var models = new List<object>();
        foreach (var m in rf2.Models.Values)
        {
            var mats = m.Materials.Values.Select(x => new { name = x.Name, textures = x.TextureRefs.Select(t => t.Name).ToArray() }).ToArray();
            var mshapes = new List<object>();
            foreach (var s in m.Shapes.Values)
            {
                var helper = new BfresLibrary.Helpers.VertexBufferHelper(m.VertexBuffers[s.VertexBufferIndex], rf2.ByteOrder);
                float[] pos = Array.Empty<float>(), nrm = Array.Empty<float>(), uv = Array.Empty<float>();
                foreach (var a in helper.Attributes)
                {
                    if (a.Name == "_p0") pos = a.Data.SelectMany(v => new[] { v.X, v.Y, v.Z }).ToArray();
                    if (a.Name == "_n0") nrm = a.Data.SelectMany(v => new[] { v.X, v.Y, v.Z }).ToArray();
                    if (a.Name == "_u0") uv = a.Data.SelectMany(v => new[] { v.X, v.Y }).ToArray();
                }
                var mesh = s.Meshes[0];
                var idx = mesh.GetIndices().Select(i => (uint)i + mesh.FirstVertex).ToArray();
                mshapes.Add(new { name = s.Name, mat = m.Materials[s.MaterialIndex].Name, skin = (int)s.VertexSkinCount, pos, nrm, uv, idx });
            }
            models.Add(new { name = m.Name, materials = mats, shapes = mshapes });
        }
        File.WriteAllText(Path.Combine(args[2], "models.json"), JsonSerializer.Serialize(new { models }));
        return 0;
    default:
        Console.Error.WriteLine($"unknown command {args[0]}");
        return 2;
}
