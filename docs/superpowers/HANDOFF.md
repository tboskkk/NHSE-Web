# Handoff — NHSE-Web foundation (all 14 tasks done)

**Branch:** `feat/foundation` · **Plan:** `docs/superpowers/plans/2026-11-22-nhse-web-foundation.md` · **Spec:** `docs/superpowers/specs/2026-11-22-nhse-web-foundation-design.md`

## State
- Tasks 1–14 complete. Final whole-branch review done; its Critical/Important findings are fixed (commit "Fix in-place save dirty tracking…").
- Task 14 (real game): the owner saved in place, imported into the ACNH PC Recomp, and the edits showed up with no corruption.
- Not yet done: merge/PR of `feat/foundation` (needs the owner's go-ahead), pinning GitHub Actions to commit SHAs, and the deferred minors (listed in the ledger `.superpowers/sdd/2026-11-22-nhse-web-foundation/progress.md`, git-ignored).

## Resume commands
```
export DOTNET_ROOT=~/.dotnet PATH=~/.dotnet:$PATH
git submodule update --init && bun install
dotnet build reference -c Release
NHSE_TEST_SAVE=$PWD/example-save-file bun test        # 79 tests
NHSE_TEST_SAVE=$PWD/example-save-file bunx playwright test   # E2E round trip
bun run typecheck
```
`example-save-file/` is git-ignored (personal IDs) — never commit it.

## Things later work depends on
- Save pipeline: `HorizonSave.save(seed, only?)` hashes+encrypts only emitted pairs. Worker `build("changed")` = dirty pairs ∪ pairs that loaded with invalid hashes; it never resets the changed set. Call `api.commit()` only after an in-place write succeeds (zip downloads do not commit).
- `EditSession.absorb()` folds save-time hash bytes into the undo shadow; `markSaved()` moves the baseline.
- Edits go through `edit(op)` in `app/src/lib/state.svelte.ts` (`session.apply(describeOp(...), applyOp(...))` in the worker); saves are serialized (`exclusive()`), edits wait for an in-flight save.
- Item `raw` = u64 as 16-digit lowercase hex; "pocket" = slots 1–20, "bag" = 21–40.
- Unverified in a real browser: native folder picker, real drag/touch, Firefox. Playwright's preview needs `BASE_PATH` set for `vite preview` too when testing a sub-path.
