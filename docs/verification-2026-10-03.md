# plot-ts verification, 2026-10-03

This report covers the current SVG changes: fail-closed test commands, title escaping,
number formatting, independent chart panels, and finite line domains/gaps. It does
not certify the installed package entrypoints or the browser/ECharts renderer.

## Recorded checkpoints

| Commit | Runtime test result | Scope |
| --- | --- | --- |
| 18db3bf752ad45183d48a9a7a542e307a3d706b1 | 64 passed | 9 helper tests, 5 title tests, 50 formatting tests |
| d8e1f301ba7ecad434e5a351c8df21a229569b53 | 81 passed | Previous 64 plus 17 grid tests |
| c201ba4e6927f6dd8e00699f78ecbf26b5a46ad8 | 102 passed | Previous 81 plus 21 line-domain/gap tests |
| c1737dc08daec169df525b248ba31cbc834b147e | 102 passed; focused strict types passed | Test-only optional-title correction; final fresh-source rerun |

The final snapshot is [c1737dc](https://github.com/junix/plot-ts/commit/c1737dc08daec169df525b248ba31cbc834b147e).
All 23 fetched source/configuration/test files were verified against their Git blob
SHAs before the final checks. Both Node and Bun passed all 102 tests.

The broader strict check at c201ba4 found one test-helper-only problem: passing
`{ title: undefined }` violates `exactOptionalPropertyTypes`. The one-line test
correction in c1737dc omits the optional property when undefined. The final strict
check includes the entire SVG graph, all six test files and the example, and passes.

## Offline checks used

- Node 24.19.0 runs the test files after esbuild 0.27.7 bundles their TypeScript imports
- Bun 1.3.14 independently runs the same TypeScript test files directly
- TypeScript 5.9.3 checks the complete SVG dependency graph, all test files, and
  examples/svg-grid-demo.ts with strict, noUncheckedIndexedAccess and
  exactOptionalPropertyTypes enabled
- The committed demo generates a 1000×760 four-panel SVG/HTML report and a
  1600×1480 ten-family SVG/HTML gallery
- SVG XML is parsed; Sharp 0.35.4 rasterizes both files; all 14 expected panels have
  visible content; the PNG outputs are visually inspected

Declared TypeScript is 7.x; the installed 5.9.3 compiler check is supplemental.
The actual npm test command reports a missing tsx loader in the offline snapshot.
Full Vite build, npm package import/export checks and browser interactions remain
unverified. No dependency versions or lockfile were changed to obtain a pass.

## Repeat with the declared project tools

In a normal checkout with the declared development dependencies already installed:

```sh
npm test
npm run lint
npm run build
node --import tsx examples/svg-grid-demo.ts out
```

All failures must retain their nonzero exit status. Do not redirect errors away or
add a success fallback. The tests are intentionally excluded by the production
tsconfig; to type-check them too, use the focused command below with the installed
project compiler and Node types.

## Repeat the supplemental offline checks

The following commands use existing local tools only. Set ESBUILD_NODE_ENTRY and
TSC_NODE_ENTRY to the installed package entrypoint files, NODE_TYPE_ROOTS to the
directory containing @types/node, and VERIFY_OUT to a fresh writable directory.
Do not download tools implicitly just to run this fallback.

```sh
node "$ESBUILD_NODE_ENTRY" tests/*.test.ts \
  --bundle --platform=node --format=esm \
  --outdir="$VERIFY_OUT/tests" --out-extension:.js=.mjs
node --test "$VERIFY_OUT/tests/"*.test.mjs
bun test tests/
node "$TSC_NODE_ENTRY" --noEmit --strict \
  --target ES2022 --module NodeNext --moduleResolution NodeNext \
  --types node --typeRoots "$NODE_TYPE_ROOTS" --skipLibCheck \
  --noUncheckedIndexedAccess --exactOptionalPropertyTypes \
  src/svg/index.ts tests/*.test.ts examples/svg-grid-demo.ts
node "$ESBUILD_NODE_ENTRY" examples/svg-grid-demo.ts \
  --bundle --platform=node --format=esm --outfile="$VERIFY_OUT/demo.mjs"
node "$VERIFY_OUT/demo.mjs" "$VERIFY_OUT/rendered"
```

These source-direct checks do not exercise package.json exports. In particular,
the unresolved ./svg export currently points at the root browser entry. A future
entrypoint fix needs a real multi-entry build, declarations and packed-package
import tests without DOM or ECharts.

## Remaining targeted gaps

- Constant scatter x coordinates and constant heatmap values need degenerate-domain policies
- Heatmap xLabels and requested colormap are not yet honored
- Waterfall ranges must include every intermediate cumulative value
- Browser configuration, streaming-series selection and disposal need separate tests
- SVG output is deterministic and structurally tested; browser animation and
  interaction require their own runtime validation
