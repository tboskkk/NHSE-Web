# NHSE-Web

A browser-based save editor for **Animal Crossing: New Horizons** — a TypeScript port of the save-handling
logic of [NHSE](https://github.com/kwsch/NHSE) with a modern web UI. Works on Linux, macOS and Windows; handles
Switch saves and ACNH PC Recomp saves. **Your save never leaves your computer.**

> ⚠️ Always keep a backup of your save. The app offers to download one before its first in-place write.

## Status
Work in progress — see `docs/superpowers/specs` and `docs/superpowers/plans`.

## Development
```
bun install
bun run typecheck
bun test            # unit tests; golden tests run when NHSE_TEST_SAVE is set
NHSE_TEST_SAVE=/path/to/save-folder bun test
```
`reference/` is a small C# CLI over the pinned upstream `NHSE.Core` (git submodule at `vendor/NHSE`) used as the
test oracle and to generate data tables. It needs the .NET 10 SDK. Clone with `--recurse-submodules`.

## Credits & license
GPL-3.0-only. This project is a port of NHSE by **kwsch** and its contributors
(<https://github.com/kwsch/NHSE>, GPLv3). Thank you for years of reverse-engineering work.
