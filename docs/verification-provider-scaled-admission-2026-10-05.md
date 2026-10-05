# Scaled provider Hub admission correction — 2026-10-05

## Verified defect and narrow correction

The scaled provider in commit `dc32c1372f1f71b50c44cb8a4936d056d4acb203`
passed its provider-only tests, but actual pinned Hub refresh rejected its new
capability description because the sentence lacked terminal punctuation.
`plotctl refresh --pin-execution --json` returned exit 4 and `malformed_manifest`,
preserving the last-known-good snapshot. This was an admission blocker; the
provider's standalone rendering success did not establish usability through Hub.

The production correction is one terminal period on the new scaled description.
Its exact command fixture receives the same one-character change. Native source,
rendering/math, input/receipt schemas and validators, runtime/IO checks, old
complete command objects and old fixtures remain byte-identical. The corrected
executable differs from the published local executable only in that punctuation
and the embedded local source-root spelling. All four native/browser JavaScript
bundles remain exactly equal to the prior verified build.

## Regression that exercises the actual receiving Hub

New `npm run test:hub-admission` requires explicit `PLOT_TS_HUB_BIN_DIR` and fails
rather than skipping if its installed `plot`/`plotctl` binaries are unavailable.
It builds the provider and uses an isolated temporary home, unrelated cwd,
snapshot, route file and provider-only PATH. It never compiles or changes Hub.

On each verified runtime, the gate:

1. Runs actual pinned refresh and requires one provider/four capabilities
2. Sets an isolated route and executes the supplied scaled example through `plot`
3. Compares exact native SVG bytes and the complete typed receipt bytes
4. Removes the terminal period from the isolated executable copy
5. Requires actual Hub punctuation rejection/exit 4 and byte-identical
   preservation of the entire last-known-good snapshot
6. Restores and successfully re-admits the exact correct executable

The ordinary package suite additionally checks sentence punctuation for every
advertised capability. This fast assertion complements real admission testing.
It does not replace full generic/expanded MCP and runtime pin-transition tests.

## Final gates and actual binary identities

Node 22.22.1 and 24.19.0 each passed:

- Lint and complete build
- All 1,235 source tests
- All 40 packed/build-source/standalone package tests
- The actual-Hub admission, native SVG/full receipt and failed-refresh regression

The five emitted JavaScript bundles match across Node versions at the same
source path. All 203 published baseline blobs were verified against a fresh
GitHub tree; no repository AGENTS/skill instruction files were present.

The actual reviewed Hub executables used here are:

- `plot`: `337a30db8de9163fcbb2547ecbad59ee3a66766638c33788fe005688370f8be7`
- `plotctl`: `62e94317aad01e0e46f67f85ad071a9e05be6cd406c3fc1edf7a621fad5a8aa9`

Unchanged native source-set SHA-256:
`f15171054f6a55a7a0675599266589da9b6ddf9e1920548103a68deace3fd701`.
Corrected local executable SHA-256:
`ebe08ec34000e81dc70c9eaeb13ae1b74b3e85f48f8d5a79f67fa5a6dbd58460`.
Corrected local raw describe SHA-256:
`fb3fc85a731ff770b7952c8cbaebb5195c77c13006d413229a9f3a3e8e8b877c`.
These execution/describe pins require deliberate refresh for the actual chosen
artifact; a different source-root spelling can change them. Prior published
artifacts and provenance remain unchanged.

## Scope

This follow-up re-ran the above gates against the corrected build. Native pixel
and browser-surface matrices were not rerun because their entire source and
four emitted native/browser bundles are byte-identical to the prior release;
the prior 227 native and 55 native-browser-surface checks per runtime remain
historical evidence, not newly counted checks. Four-transport Hub acceptance is
tracked independently. No new font/dependency/toolchain download or copy,
cleanup, Rust build, publication, remote CI or real browser review occurred.
