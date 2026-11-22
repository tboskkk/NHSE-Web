# Handoff — NHSE-Web (foundation shipped; next sub-project not started)

**Repo:** https://github.com/tboskkk/NHSE-Web (public) · **Live app:** https://tboskkk.github.io/NHSE-Web/ · **Branch:** `main` only (feature branches merged and deleted)
**Plan/spec (done):** `docs/superpowers/plans/2026-11-22-nhse-web-foundation.md`, `docs/superpowers/specs/2026-11-22-nhse-web-foundation-design.md`

## State
- Foundation complete: load/verified save, undo/redo, player editor (profile, money, pockets, bag, storage, item picker). 81 unit+golden tests, Playwright zip round trip, CI green, Pages deploy green (separate build/deploy jobs, Actions pinned to SHAs).
- Real-game acceptance passed: a save edited in the app (Save in place) imported into the ACNH PC Recomp with edits visible and no corruption.
- Final whole-branch review done; all Critical/Important findings fixed.

## Resume commands
```
export DOTNET_ROOT=~/.dotnet PATH=~/.dotnet:$PATH      # .NET 10 SDK in ~/.dotnet (reference CLI only)
git submodule update --init && bun install
dotnet build reference -c Release                      # golden tests use `dotnet run --no-build`
NHSE_TEST_SAVE=$PWD/example-save-file bun test         # 81 pass
NHSE_TEST_SAVE=$PWD/example-save-file bunx playwright test
bun run typecheck
```
`example-save-file/` is git-ignored (personal IDs): never commit it, never put it in a public artifact.

## Architecture facts later work depends on
- Core (`packages/core`) is pure TS, verified byte-identical against upstream NHSE.Core through the C# oracle in `reference/` (golden tests; `reference/Commands/Edit.cs` mirrors the `EditOp` schema in `packages/core/src/edit/ops.ts`). New save structures should get an oracle command + golden test first.
- Save pipeline: `HorizonSave.save(seed, only?)` hashes+encrypts only emitted pairs; pair paths have no extension (`"main"`, `"Villager0/personal"`); `passthrough` holds non-pair files (landname.dat).
- Worker API (`app/src/worker/handlers.ts`, protocol in `protocol.ts`): `build("changed")` = dirty pairs ∪ pairs that loaded with invalid hashes and never resets the changed set; call `api.commit()` only after an in-place write succeeds (zip downloads don't commit). `EditSession.absorb()` folds save-time hash bytes into the undo shadow; `markSaved()` moves the baseline.
- UI edits go only through `edit(op)` in `app/src/lib/state.svelte.ts`; saves are serialized (`exclusive()`), edits wait for an in-flight save, Save waits for pending edits. `applyOp` validates ranges before touching bytes.
- Item `raw` = u64 as 16-digit lowercase hex (`"000000000000fffe"` = none). `"pocket"` = slots 1–20, `"bag"` = 21–40, per-area slot numbering in labels.
- Preview under a sub-path needs `BASE_PATH` on `vite preview` too. Don't run `pkill -f` patterns that match your own command line.

## Known gaps / deferred (all minor)
- Unverified in a real browser: native folder picker, real mouse/touch drag, Firefox.
- ItemPicker draft resets on any refetch (e.g. a money edit); redo button state vs worker redo stack can disagree after a no-op edit; ProfileCard calls `api.itemCatalog` instead of cached `loadCatalog`.
- Names truncated at 10 UTF-16 units can leave a lone surrogate (matches upstream, pinned by a test).
- Hash warning is a dismissible banner; spec says warn before allowing edits.
- The E2E test leaves a zip of the personal save in os.tmpdir(); an untracked git-ignored `test-results/` dir may exist.

## Next
Spec roadmap sub-projects: **villagers**, **map/terrain editor** (the owner's main motivation: modern canvas editor with zoom/pan, brushes, undo, sprites), **collections**. Start with `superpowers:brainstorming` for the chosen one; reuse the oracle-first/golden-test approach.
