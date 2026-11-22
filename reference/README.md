# Reference CLI

A small .NET console app that runs the **real upstream `NHSE.Core`** (git submodule at `vendor/NHSE`, pinned commit).
It is the test oracle for the TypeScript port and the source of the generated data tables.

Requires the .NET 10 SDK (`dotnet-install.sh --channel 10.0`).

```
dotnet run -c Release --project reference -- vectors <out.json>
dotnet run -c Release --project reference -- dump <saveDir> <outDir>
dotnet run -c Release --project reference -- save <saveDir> <seed> <outDir>
dotnet run -c Release --project reference -- edit <saveDir> <ops.json> <seed> <outDir>
dotnet run -c Release --project reference -- export-data <outDir>
```
