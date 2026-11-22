# NHSE-Web

A browser-based save editor for **Animal Crossing: New Horizons** — a TypeScript port of the save-handling
logic of [NHSE](https://github.com/kwsch/NHSE) with a modern web UI. Works on Linux, macOS and Windows; handles
Switch saves and ACNH PC Recomp saves. **Your save never leaves your computer.**

## 👉 Use it now: **https://tboskkk.github.io/NHSE-Web/**
No install needed. Open the page, pick your save folder (or drop a `.zip`), edit, and save. Chrome, Edge and Brave can
write changes straight back into the folder; Firefox and Safari download a zip instead.

> ⚠️ Always keep a backup of your save. The app offers to download one before its first in-place write.

## Using it
Open the site, then **Open save folder** (Chromium-based browsers: Chrome, Edge, Brave, and others on Linux, macOS
and Windows) or drop a save folder or `.zip` onto the page. Pick the folder that contains `main.dat` (a parent
folder or a zip with a wrapper folder also works).

- **Chromium:** *Save in place* writes only the changed files back into the folder you opened. The first in-place
  save downloads a timestamped backup `.zip` of your original save.
- **Firefox / Safari:** these browsers cannot write into a folder, so use **Save as zip** and unpack the result over
  your save folder yourself.

> ⚠️ Back up your save before editing. In-place saving is offered with an automatic backup, but a backup you made
> yourself is the one you can trust. Edits are re-hashed and re-encrypted, and every written file is re-decrypted
> and verified first; if verification fails nothing is written.

Everything runs in your browser (a Web Worker holds the save). No save data is sent anywhere.

## Status
Foundation: loading, verified saving, undo/redo, and the player editor (profile, money, pockets, bag, storage).
Villagers, map, and collections are planned (see `docs/superpowers/specs` and `docs/superpowers/plans`).

## Development
```
bun install
bun run typecheck
bun test                       # unit tests; golden tests run when NHSE_TEST_SAVE is set
NHSE_TEST_SAVE=/path/to/save-folder bun test
NHSE_TEST_SAVE=/path/to/save-folder bunx playwright test   # E2E round trip (builds and previews the app)
bun run dev --cwd app          # or: cd app && bunx vite
```
`NHSE_TEST_SAVE` points at a real save folder. Golden and E2E tests are skipped without it. Never commit a real
save: it contains personal identifiers (`example-save-file/` is git-ignored).

`reference/` is a small C# CLI over the pinned upstream `NHSE.Core` (git submodule at `vendor/NHSE`). It is the test
oracle: golden tests run it and require byte-identical output. It needs the .NET 10 SDK. Clone with
`--recurse-submodules`, then `dotnet build reference -c Release` before running golden tests.

`bun run gen:data` regenerates `packages/core/src/generated/*` and `app/public/{data,sprites}` from the reference CLI
(needs the submodule and .NET). The generated files are committed, so CI and the web build need neither.

Deploying under a sub-path (GitHub Pages): `BASE_PATH=/repo-name/ bun run build`. Preview it with the same
variable set: `cd app && BASE_PATH=/repo-name/ bunx vite preview`.

## Credits & license
GPL-3.0-only. This project is a port of NHSE by **kwsch** and its contributors
(<https://github.com/kwsch/NHSE>, GPLv3). Thank you for years of reverse-engineering work.
