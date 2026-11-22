using NHSE.Core;

namespace NHSE.Reference.Commands;

public static class SaveCmd
{
    public static void Run(string saveDir, uint seed, string outDir)
    {
        Program.CopyDir(saveDir, outDir);
        HorizonSave.FromFolder(outDir).Save(seed);
    }
}
