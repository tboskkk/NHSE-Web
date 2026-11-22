# NHSE-Web — Foundation + Player Editor Design

**Date:** 2026-11-22
**Status:** Approved in brainstorming, pending written-spec review
**Upstream:** https://github.com/kwsch/NHSE (GPLv3) — this project is a GPLv3 port

## 1. Purpose

A browser-based save editor for Animal Crossing: New Horizons, porting the save-handling
logic of NHSE (`NHSE.Core`, C#/.NET) to TypeScript and replacing its Windows-only WinForms
UI with a modern web UI. It must work on Linux (and anywhere a modern browser runs), handle
both Switch saves and ACNH PC Recomp saves (same format), and never upload save data.

The project will be public (GitHub, static site on GitHub Pages) and shared with the community.

### Success criteria for this spec (sub-project 1)

1. Load the user's 3.0.3 save folder, decrypt all files, verify all hashes.
2. Edit Player basics (profile, money, pockets/bag/storage) with undo/redo.
3. Save in place (Chromium) or as a .zip (any browser) with correct hashes and encryption.
4. Golden tests prove TS output is byte-identical to `NHSE.Core` for decrypt, field reads,
   same-seed re-encrypt, and identical edits.
5. The edited save loads in the ACNH PC Recomp with the edits visible and no corruption.

## 2. Context and findings

- `NHSE.Core` is ~27.5k lines / 231 files of UI-free C#, plus ~6 MB resources (item/villager
  text in 10 languages, item kind/size/sort tables). `NHSE.Sprites` holds ~7.4 MB of sprites.
- Save format: each file is a `<name>.dat` + `<name>Header.dat` (0x300 bytes) pair. Data is
  AES-128-CTR encrypted; key and counter derive from a XorShift128 PRNG over header bytes
  0x100–0x300. Integrity is per-region Murmur3 hashes, with region tables per game revision.
  Some values (Bells, Nook Miles) are stored as `EncryptedInt32` with a checksum byte.
- The provided example save (`example-save-file/`) is revision **3.0.3** (header
  `Major 0xA0002`, `Minor 0xA0028`, `SaveRevision 34`). `main.dat` (10,161,808 B) and
  `personal.dat` (477,760 B) match NHSE's REV_300 sizes exactly. It is a standard encrypted
  layout: `main`, `landname.dat`, and `Villager0/{personal,postbox,photo_studio_island,profile}`.

## 3. Project decomposition

| # | Sub-project | Notes |
|---|-------------|-------|
| 1 | **Foundation + Player basics** | This spec |
| 2 | Villagers | Own spec later |
| 3 | Map / terrain | Own brainstorm: aim for a modern canvas editor (zoom/pan, brushes, undo, sprites) rather than a port of NHSE's grid UI |
| 4 | Collections | Recipes, museum, critterpedia, reactions, achievements |

Sub-project 1 ports the parts of `NHSE.Core` it needs (crypto, save meta, offsets, the
Personal file, Item structure, strings, item metadata); later sub-projects port the rest.

## 4. Technology

- **Language:** TypeScript (strict) throughout.
- **Tooling:** Bun (package manager, `bun test`, scripts); Vite (dev server and build) run via Bun.
- **UI:** Svelte 5.
- **Worker:** core runs in a Web Worker; UI talks to it through a typed message API.
- **Reference oracle:** .NET SDK on Linux + a C# CLI that references upstream `NHSE.Core`.
- **E2E:** Playwright (light coverage).
- **Deploy:** static build to GitHub Pages via GitHub Actions.
- **License:** GPLv3, with credit to kwsch and NHSE contributors in the README.

Rejected alternatives: running `NHSE.Core` in the browser via Blazor/.NET WASM (10 MB+
payload, slow start, two-language maintenance); a Rust/WASM core (same porting cost plus a
binding layer, and nothing in the workload needs the speed).

## 5. Architecture

```
nhse-web/
├─ packages/core/          TS port of NHSE.Core — no DOM, no UI
│   ├─ crypto/             XorShift128, AesCtr, Murmur3, EncryptedInt32
│   ├─ save/               HorizonSave, MainSave, Personal, PostBox, PhotoStudioIsland,
│   │                      Profile, EncryptedFilePair, FileHeaderInfo, RevisionChecker
│   ├─ offsets/            per-revision offset tables (1.0.0 → 3.0.3)
│   ├─ structures/         Item (+ later Villager, Map, Building, Recipe…)
│   └─ strings/            game text, loaded lazily per language
├─ packages/io/            save in/out of the browser
│   ├─ fsAccess.ts         File System Access API (Chromium): open folder, write in place
│   └─ zip.ts              load picked folder or .zip; produce .zip download
├─ app/                    Svelte 5 UI
├─ reference/              C# CLI over upstream NHSE.Core (test oracle)
└─ tests/                  unit + golden + e2e
```

Principles:

- **Byte-backed models.** A loaded save is a set of `Uint8Array` buffers. Core classes expose
  typed getters/setters over them (`personal.wallet`, `personal.pocket[i]`). Unknown bytes
  pass through untouched. This mirrors NHSE's `Span<byte>` design.
- **Mirror upstream file layout** where reasonable, so upstream changes (new game
  revisions, fixes) are easy to locate and apply.
- **Off-main-thread.** Decrypt, hash, and encrypt run in a Web Worker. The UI sends edit
  commands and receives view snapshots.
- **Lazy assets.** Only the selected language's text loads. Item sprites load as they come
  into view.
- **Dependency direction:** `app → io → core`. `core` has no knowledge of browsers or files.
  It takes and returns a `Map<path, Uint8Array>`.

## 6. Load / save / safety

### Loading
1. The user picks a folder (Chromium: `showDirectoryPicker` with readwrite permission), or
   drops/picks a folder or `.zip` (any browser).
2. Read every `*Header.dat`/`*.dat` pair: `main` plus each `VillagerN/` directory.
3. Read `FileHeaderInfo`. Resolve the revision via `RevisionChecker` and validate file sizes.
   **An unknown revision or a size mismatch makes loading fail** with a specific message,
   never a guess.
4. Decrypt every file and check every hash region. If any hash is already invalid, show a
   warning before allowing edits.

### Saving
Order (same as NHSE): recompute all hash regions → encrypt each pair with a fresh random seed →
**verify** (decrypt what was just produced, compare to the in-memory data, recheck hashes;
abort on any mismatch) → write.

- **In place (Chromium):** before the first in-place write of a session, download
  `<Island>_backup_<YYYY-MM-DD_HH-mm>.zip` containing the untouched original files. Then
  write only the changed `.dat` pairs back to the opened folder. **Nothing else is ever
  written into the save folder.**
- **Zip (any browser):** download `<Island>_<YYYY-MM-DD>.zip` containing the complete edited
  save folder. Where it goes is up to the user (recomp importer, Switch tooling, etc.).

### Editing safety
- **Undo/redo** for the whole session. Each edit is stored as a byte patch
  (`file, offset, before, after`).
- **Change list** describing pending edits in human terms before saving.
- **Validation:** game-valid ranges (e.g. wallet ≤ 99,999), known item IDs, and
  `EncryptedInt32` checksum integrity. An "advanced" toggle lifts range limits but never
  bypasses checksum or format integrity.
- **Privacy:** no network calls with save data, no analytics, no server.

## 7. UI

### Shell
- **Empty state:** "Open save folder" button plus a drop zone, with a note that data stays local.
- **Loaded:** left sidebar with Players (one entry per resident), Villagers, Map, Collections,
  Island. Sections not built yet are greyed out and labelled "coming soon".
- **Top bar:** island name, revision badge (e.g. `3.0.3`), undo/redo, pending-changes
  counter, Save (in place / zip).
- System light/dark theme. Shortcuts: `Ctrl+Z`, `Ctrl+Shift+Z`, `Ctrl+S`, `/` for search.

### Player editor
- **Profile:** name, birthday, native fruit. Town ID and player ID are shown read-only with
  an explanation.
- **Money:** wallet, bank, Nook Miles (current, total). Number inputs show their limits and
  have "max" buttons.
- **Inventory:** pockets (slots 1–20) and bag (21–40) as sprite grids. Home storage as a
  virtualized scrolling grid. Unlocked slot counts appear as a clear control.
- **Item picker panel** (opened from any slot): fuzzy search over all item names in the
  current language; category filters (tools, furniture, clothing, DIY recipes, fossils, …);
  editors for variant/remake, count, durability/uses, and flags where applicable.
- **Slot interactions:** drag to move or swap. Context menu: clear, duplicate, fill row,
  fill all.

## 8. Testing

### Reference CLI (`reference/`)
A .NET console app that references upstream `NHSE.Core` (pinned commit). Commands: dump
decrypted files, check hashes, dump Player fields as JSON, re-encrypt with a given seed,
apply a scripted edit then save with a given seed.

### Test layers (`bun test`)
1. **Unit:** XorShift128, Murmur3, AES-CTR, EncryptedInt32, against vectors produced by the
   reference CLI.
2. **Golden (needs a real save):** for each file, TS and C# must produce identical decrypted
   bytes, hash-validity results, and Player field dumps. Same-seed re-encryption must be
   byte-identical. Scripted edits (e.g. wallet = 12,345; Golden Shovel in pocket slot 3)
   applied in both must produce byte-identical saves.
3. **E2E (Playwright, light):** load save → edit Bells → save as zip → reload the zip →
   value persisted.

### Real saves and the public repo
- `example-save-file/` is in `.gitignore` from the first commit. It contains personal
  identifiers.
- Golden tests read the save path from `NHSE_TEST_SAVE`. If it is unset, they are skipped.
- CI (GitHub Actions) runs unit tests, typecheck, and build. Golden tests run locally.

### Acceptance gate
The user loads an edited save in the ACNH PC Recomp and confirms the edits appear with no
corruption, before sub-project 1 is called done.

## 9. Out of scope for this spec
Villager, map/terrain, collections, and island-level editors (sub-projects 2–4). Also out of
scope: NHSE.Injection (live RAM editing), batch editors, design-pattern import/export, and
localization of the app UI itself (game text is localized; app chrome is English at first).
