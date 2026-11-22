// Regenerates tests/fixtures/vectors.json from the real upstream NHSE.Core via the reference CLI.
import { $ } from "bun";
const root = new URL("..", import.meta.url).pathname;
process.env.DOTNET_ROOT ??= `${process.env.HOME}/.dotnet`;
process.env.PATH = `${process.env.HOME}/.dotnet:${process.env.PATH}`;
await $`dotnet run -c Release --project ${root}reference -- vectors ${root}tests/fixtures/vectors.json`;
console.log("wrote tests/fixtures/vectors.json");
