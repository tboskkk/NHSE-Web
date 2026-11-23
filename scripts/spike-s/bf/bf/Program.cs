using BfresLibrary;
using System.Text.Json;
var rf = new ResFile(args[0]);
Console.WriteLine($"name={rf.Name} ver={rf.VersionMajor}.{rf.VersionMajor2}.{rf.VersionMinor}.{rf.VersionMinor2} models={rf.Models.Count} ext={rf.ExternalFiles.Count}");
foreach (var kv in rf.ExternalFiles) { Console.WriteLine($"ext {kv.Key} {kv.Value.Data.Length}"); File.WriteAllBytes(Path.Combine(args[1], kv.Key), kv.Value.Data); }
var outModels = new List<object>();
foreach (var m in rf.Models.Values)
{
    Console.WriteLine($"model {m.Name} shapes={m.Shapes.Count} mats={m.Materials.Count} vbs={m.VertexBuffers.Count}");
    foreach (var mat in m.Materials.Values) Console.WriteLine($"  mat {mat.Name} tex=[{string.Join(",", mat.TextureRefs)}] samplers={mat.Samplers.Count}");
    var shapes = new List<object>();
    foreach (var s in m.Shapes.Values)
    {
        var vb = m.VertexBuffers[s.VertexBufferIndex];
        var helper = new BfresLibrary.Helpers.VertexBufferHelper(vb, rf.ByteOrder);
        Console.WriteLine($"  shape {s.Name} vb={s.VertexBufferIndex} mat={s.MaterialIndex} lods={s.Meshes.Count} attrs=[{string.Join(",", helper.Attributes.Select(a=>a.Name+":"+a.Format))}]");
        float[] pos = null, uv = null;
        foreach (var a in helper.Attributes)
        {
            if (a.Name == "_p0") pos = a.Data.SelectMany(v => new[]{v.X, v.Y, v.Z}).ToArray();
            if (a.Name == "_u0") uv = a.Data.SelectMany(v => new[]{v.X, v.Y}).ToArray();
        }
        var idx = s.Meshes[0].GetIndices().Select(i => (uint)i + s.Meshes[0].FirstVertex).ToArray();
        shapes.Add(new { name = s.Name, mat = m.Materials[s.MaterialIndex].Name, pos, uv, idx });
    }
    outModels.Add(new { name = m.Name, shapes });
}
File.WriteAllText(Path.Combine(args[1], "model.json"), JsonSerializer.Serialize(outModels));
