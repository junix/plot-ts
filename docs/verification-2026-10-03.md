# plot-ts verification, 2026-10-03

This report records the earlier panel/line checkpoint and distinct later SVG-edge
checkpoints. It covers fail-closed test commands, escaped output, number formatting,
independent chart panels, finite domains, shared scales, zero-data repairs, and
bounded input policies. It does not certify the installed package entrypoints or the
browser/ECharts renderer.

## Recorded checkpoints

| Commit | Runtime test result | Scope |
| --- | --- | --- |
| 18db3bf752ad45183d48a9a7a542e307a3d706b1 | 64 passed | 9 helper tests, 5 title tests, 50 formatting tests |
| d8e1f301ba7ecad434e5a351c8df21a229569b53 | 81 passed | Previous 64 plus 17 grid tests |
| c201ba4e6927f6dd8e00699f78ecbf26b5a46ad8 | 102 passed | Previous 81 plus 21 line-domain/gap tests |
| c1737dc08daec169df525b248ba31cbc834b147e | 102 passed; focused strict types passed | Test-only optional-title correction; earlier panel/line final rerun |
| 12d3e7d62779e365d51ae6b0a686262a0171981d | 215 passed in Node and Bun; focused strict types passed | Eight-repair SVG-edge checkpoint; corpus identified remaining label/option defects |
| 11e0e607a3affae5c72b9f1806ba9c751baa7fa0 | 327 passed in Node and Bun; focused strict types passed | Input/option repairs; corpus retained one extra grouped-bar value/domain witness |
| 6a6f50d42a869625ea224af49d1db632b30311bf | 351 passed in Node and Bun; focused strict types passed | Later combined SVG-edge checkpoint |

The earlier panel/line snapshot is [c1737dc](https://github.com/junix/plot-ts/commit/c1737dc08daec169df525b248ba31cbc834b147e).
All 23 fetched source/configuration/test files were verified against their Git blob
SHAs before that checkpoint's checks. Both Node and Bun passed all 102 tests.

The broader strict check at c201ba4 found one test-helper-only problem: passing
`{ title: undefined }` violates `exactOptionalPropertyTypes`. The one-line test
correction in c1737dc omits the optional property when undefined. The strict
check for that snapshot includes the entire SVG graph, all six test files and the example, and passes.

## Earlier panel/line checkpoint checks (102 tests)

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

## SVG edge checkpoint: 6a6f50d42a86

This is a separate later checkpoint at [6a6f50d42a869625ea224af49d1db632b30311bf](https://github.com/junix/plot-ts/commit/6a6f50d42a869625ea224af49d1db632b30311bf). It includes all earlier panel/line changes and the bounded repairs below.

| Published source commit | Repair | Bounded contract |
| --- | --- | --- |
| [1a9f6216c53d](https://github.com/junix/plot-ts/commit/1a9f6216c53dbcb07bae846597db11b1dc161ba6) | Scatter constant/empty domains | Constant X is centered; nonfinite coordinate pairs are omitted and no-finite-pair domains stay finite |
| [4110e98030cd](https://github.com/junix/plot-ts/commit/4110e98030cd7308e594632a35e086a2c14a22a0) | Constant heatmap palette | Constant finite cells explicitly use the Viridis midpoint `#26838e`; the later palette-option repair extends this policy to the selected palette |
| [c9a8aad06274](https://github.com/junix/plot-ts/commit/c9a8aad062747d1969fa7d2417bc863661bb8c84) | Singleton donut ring | One positive part uses valid full-ring geometry, with its hole and original color index retained |
| [92c40ef72a4b](https://github.com/junix/plot-ts/commit/92c40ef72a4bfbf2ff2ae3d3f4d3d49e37aa4dfb) | Waterfall cumulative extent | The automatic domain includes zero and every cumulative endpoint |
| [82d9829fbdd2](https://github.com/junix/plot-ts/commit/82d9829fbdd273122165c23430d61f68dc01a017) | Signed stacked bars | Independent positive/negative totals and accumulators preserve signed magnitudes and original all-positive order |
| [4731ebee874a](https://github.com/junix/plot-ts/commit/4731ebee874a687643e256d0cb511b551ddadfdb) | Radar shared scale | One global automatic maximum covers every series and declared axis, with valid explicit axis maxima overriding it |
| [6f2427a752c4](https://github.com/junix/plot-ts/commit/6f2427a752c44ef79f187ef2689e5cf729793bc1) | Gauge zero domain | Omitted max with zero value uses `0..1`; local finite-value and positive-explicit-max validation is documented |
| [12d3e7d62779](https://github.com/junix/plot-ts/commit/12d3e7d62779e365d51ae6b0a686262a0171981d) | Pyramid zero domain | All-zero layers retain finite centered zero-width marks and labels; negative/nonfinite layers are rejected locally |
| [c27df51568f2](https://github.com/junix/plot-ts/commit/c27df51568f2c0a07b0259b55cb684f34a4a84b0) | Empty heatmap Y labels | Explicit `yLabels: []` uses the same no-label margin as omitted labels |
| [e3b15671609f](https://github.com/junix/plot-ts/commit/e3b15671609fcb3a9b273906ce94bd5b4a4be22b) | Wide custom gauge bands | Custom band spans over 180 degrees select the large arc on both annular boundaries, preserving opposite outer/inner winding |
| [98edd51e2e79](https://github.com/junix/plot-ts/commit/98edd51e2e7908b0ef2bae88f6dd54b33f8c44b9) | Heatmap X labels | Requested X labels are centered below their cells, escaped, and contained in the already reserved bottom margin |
| [efad6663efde](https://github.com/junix/plot-ts/commit/efad6663efde24efa44bac712fcc2d526013545a) | Heatmap palette options | Viridis keeps its original colors; plasma and blues use the existing repository palettes, including selected-palette midpoint handling for constant matrices |
| [11e0e607a3af](https://github.com/junix/plot-ts/commit/11e0e607a3affae5c72b9f1806ba9c751baa7fa0) | Numeric/data-shape boundaries | Local render-time RangeErrors prevent nonfinite observations, ragged heatmaps, mismatched waterfall counts, and invalid rendered scatter sizes from reaching SVG geometry |
| [6a6f50d42a86](https://github.com/junix/plot-ts/commit/6a6f50d42a869625ea224af49d1db632b30311bf) | Bar category-paired domain | Only finite category-paired values influence inferred bar domains; undrawn extras are ignored and existing short-series omission is retained |

The radar automatic policy is intentionally global across axes as well as series. This preserves ordinary single-series shapes while comparing magnitudes across series; it supersedes the audit's earlier per-axis automatic-scale proposal. Undeclared extra finite values do not change the inferred scale. Empty/all-zero data uses 1; valid explicit axis.max retains its existing clipping behavior. Invalid explicit radar maxima still fall back to the automatic scale.

Gauge has a different, explicitly documented local contract: its value must be finite and an explicit max must be finite and positive. A finite negative value retains the zero-end clamp only with an explicit positive max. Pyramid values must be finite and nonnegative. Gauge/pyramid reject inferred scales that cannot be represented as finite positive domains.

The final data-boundary repair adds local RangeErrors at render time for nonfinite observations in heatmap, waterfall, donut, radar, and slope; ragged heatmap rows; unequal waterfall category/value counts; and nonfinite or negative scatter sizes on rendered finite coordinate pairs. Line/scatter coordinate omission remains intact, including original scatter animation indexing, default size 4, and explicit size 0. Radar short/empty/sparse arrays retain their zero fallback; supplied nonfinite extras are rejected even when beyond the declared axes. Finite signed data and empty valid inputs retain their existing behavior. These are bounded per-renderer contracts, not a new global schema or sign policy.

Wide gauge bands now select the SVG large-arc flag on both boundaries for spans over 180 degrees, retaining the outer clockwise/inner counterclockwise winding. Ordinary/default/narrow-band geometry is unchanged. This does not add band validation, clamping, or normalization.

Heatmap X labels are escaped, centered under their corresponding cells, and drawn in the existing bottom margin; extra labels are ignored and missing labels are left blank. Existing geometry and Y labels are retained. Omitted X labels keep the prior 2px bottom margin; an explicit empty X-label array keeps the prior 24px margin. Default/explicit Viridis preserves its existing colors. Plasma (10 colors) and Blues (9 colors) reuse the repository's existing palette arrays; constant matrices use the selected midpoint, including Plasma's upper-middle #d8576b. Unknown runtime colormap names now raise RangeError, even for empty data.

The final bar-domain repair uses only finite values paired with rendered categories when inferring the domain. Extra values are ignored; short series, nulls, and nonfinite values retain omission. Explicit max and the signed-stack semantics are unchanged.

The exact render-time error contracts are documented in [SVG numeric-data boundaries](svg-data-validation.md).

### Final-source verification

The preceding eight-repair snapshot [12d3e7d62779](https://github.com/junix/plot-ts/commit/12d3e7d62779e365d51ae6b0a686262a0171981d) independently passed all 215 tests in Node and Bun, strict TypeScript, and the two demo raster checks, with 31 source/configuration/test blobs verified. Its 118-case sweep also isolated the remaining ordinary-input defect for explicit empty heatmap Y labels and confirmed separate gauge-band and heatmap display-option defects. Their bounded corrections are included in the final checkpoint below.

The subsequent [11e0e607a3af](https://github.com/junix/plot-ts/commit/11e0e607a3affae5c72b9f1806ba9c751baa7fa0) checkpoint passed 327 Node/Bun source tests after the display-option and data-boundary repairs. Its bounded replay had 94 structurally clean SVGs and 24 intended rejections, but still correctly reported the existing unmatched grouped-bar value/domain witness. The last narrow paired-domain repair closes that witness at the final checkpoint.

- All **39 freshly fetched source/configuration/test/example files** matched their Git blob SHAs before and after execution at 6a6f50d42a869625ea224af49d1db632b30311bf
- **351/351 tests passed under Node 24.19.0 with esbuild 0.27.7, and 351/351 under Bun 1.3.14**, across 20 test files
- Strict TypeScript 5.9.3 checking passed for the entire SVG dependency graph, all 20 test files, and all three committed SVG examples, including noUncheckedIndexedAccess and exactOptionalPropertyTypes. The package-declared TypeScript 7 toolchain remains unavailable
- The actual svg-grid-demo.ts, svg-heatmap-labels.ts, and svg-heatmap-colormaps.ts scripts ran in both Node and Bun. All eight SVG/HTML output pairs were byte-identical
- All six distinct SVG outputs parsed as XML and rasterized using Sharp 0.35.4. The six Node/Bun PNG pairs were byte-identical and all six final PNGs were visually inspected. Both composed figures retained all 14 visible panels: 1000×760 with four panels and 1600×1480 with ten. The label example is 720×360; each of the three palette examples is 720×300. Label/cell counts and distinct palette sequences were checked
- The exact npm test command still exits 1 because tsx is missing. Full Vite, installed-package exports, browser interaction/animation, and CI acceptance remain unverified; no dependency download or error-suppression workaround was used

### Bounded 118-case recheck

The original **118 cases across the same ten SVG families** were replayed without adding or changing a case. All 118 outcomes agreed between Node and Bun: **94 rendered SVGs and 24 intentional RangeError rejections**. All 94 returned SVG byte strings matched across the runtimes, parsed as XML, and rasterized with Sharp. The numeric-size/missing-fill scan and the existing finite semantic checks both found **zero flagged cases**.

The original 13 correctness witnesses pass; the portable 13-witness suite passes in both Node and Bun. The portable diagnostic now exits **0**, including the same grouped-bar counterexample that correctly kept the preceding checkpoint nonzero. The original and portable corpus configurations, case order, outcomes, and SVG bytes match. Rejected inputs are recorded as exceptions, not fake or successfully parsed SVGs.

The 24 rejections implement the documented local numeric/data-shape contracts. The classifications also preserve six intentional-omission cases, three documented radar partial/extra-value cases, and eight finite policy-sensitive probes where no defect was detected. These classifications do not establish a universal validity policy or correctness for untested inputs.

See the [detailed bounded report](verification/svg-edge-audit-2026-10-03.md), [exact classified case record](verification/svg-edge-audit-2026-10-03.json), and [portable replay instructions](../tools/svg-edge-audit/README.md). The original baseline and intermediate failures remain recorded; no failure was suppressed to make the final result green.

These checks exercise exported repository source directly. They do not repair or
verify the installed `plot-ts/svg` package path, and do not establish the declared
npm/tsx/Vite workflow, browser behavior, or CI success. A parseable or rasterizable
SVG is not by itself proof of correct numeric geometry or chart semantics.

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
  src/svg/index.ts tests/*.test.ts examples/*.ts
node "$ESBUILD_NODE_ENTRY" examples/svg-grid-demo.ts \
  --bundle --platform=node --format=esm --outfile="$VERIFY_OUT/demo.mjs"
node "$VERIFY_OUT/demo.mjs" "$VERIFY_OUT/rendered"
node "$ESBUILD_NODE_ENTRY" examples/svg-heatmap-labels.ts examples/svg-heatmap-colormaps.ts \
  --bundle --platform=node --format=esm \
  --outdir="$VERIFY_OUT/examples" --out-extension:.js=.mjs
(cd "$VERIFY_OUT/rendered" && node ../examples/svg-heatmap-labels.mjs && node ../examples/svg-heatmap-colormaps.mjs)
```

These source-direct checks do not exercise package.json exports. In particular,
the unresolved ./svg export currently points at the root browser entry. A future
entrypoint fix needs a real multi-entry build, declarations and packed-package
import tests without DOM or ECharts.

## Remaining targeted gaps

- **No blanket sign/configuration policy was added:** finite signed observations retain their existing behavior outside the specifically documented gauge/pyramid rules. Negative donut parts, negative radar samples, custom gauge-band normalization, and invalid explicit radar maxima were not redesigned. Radar's existing invalid-max fallback remains distinct from gauge's rejection policy
- **Layout and extreme-value limits remain:** very long labels, bar labels at a plot boundary, the retained half-pixel minimum for zero/tiny bars, panels smaller than their chart margins, and extreme-magnitude numerical overflow remain outside the verified envelope
- **Release/runtime gates remain open:** fix the installed `./svg` export with a real multi-entry build, declarations, and packed-package Node imports without DOM/ECharts. Run the declared npm/tsx/TypeScript 7/Vite workflow separately. Browser configuration, streaming selection, disposal, animation, and interaction still require browser-specific tests

## Browser-contract checkpoint: d1c7f2d4dd7

This separate later checkpoint is pinned to [d1c7f2d4dd7ee2c54255f6672f236f5d514c74fd](https://github.com/junix/plot-ts/commit/d1c7f2d4dd7ee2c54255f6672f236f5d514c74fd). It adds bounded tests of the production browser Figure at a mocked ECharts boundary. It is **not a browser-rendering or real-ECharts integration pass**.

### Repairs covered

- [Lifecycle, fe6f206](https://github.com/junix/plot-ts/commit/fe6f206eb30484ae923617c0a15526ea8254169a): disposal removes the resize listener, cancels owned streams, and is idempotent. Stale callbacks and generator-triggered disposal/stopping cannot append afterward; independent Figures and streams remain active
- [Axis updates, 8b772107](https://github.com/junix/plot-ts/commit/8b77210732fe7f57bb57e74bbade899305cd565b): axis calls are partial updates. Omitted fields retain their values; supplied labels, bounds, log settings, and grid visibility reach the outgoing options, including zero, false, and empty labels
- [Series selection, da2cbbc](https://github.com/junix/plot-ts/commit/da2cbbc744c9faf4cb64b9dc22eb7cdf9f185456): all six builders receive stable Figure-owned IDs. Incremental updates address the selected ID despite duplicate names or unnamed predecessors; IDs survive re-rendering. Raw-chart replacement and non-XY streaming remain outside the contract
- [Heatmap row labels, c0f4f96](https://github.com/junix/plot-ts/commit/c0f4f96f3c373d2a8d2d1149f2f010535c540049): configured Y-axis category data reaches render/update payloads, preserving supplied row labels or independently generated row indices without transposing matrix coordinates
- [Bounded history, d1c7f2d](https://github.com/junix/plot-ts/commit/d1c7f2d4dd7ee2c54255f6672f236f5d514c74fd): maxPoints defaults to 50 and must be a positive safe integer. A successful append retains the newest N points, including when initial history already exceeds the limit. Invalid bounds fail before existing-series mutation or live-stream timer allocation. Missing append targets and disposed streams retain their documented no-op behavior

The detailed selection, retention, and failure-recovery contracts are in [Browser streaming](browser-streaming.md).

### Independent final-source checks

- Fresh GitHub tree reads verified all **55 materialized repository files** against the final commit's blob SHAs before and after execution, covering all source, tests, examples, and portable audit tools plus the selected configuration/documentation files
- **442/442 tests passed in Node 24.19.0 and 442/442 in Bun 1.3.14**, across 24 test files: the earlier 351 SVG/helper tests plus 91 browser-contract tests. Node ran esbuild 0.27.7 CommonJS bundles with the existing TypeScript module resolvable; Bun ran TypeScript source directly
- The shared harness evaluates the actual Figure and palette source with fake ECharts, window events, and timers. Streaming assertions inspect outgoing patches and a focused ID/position merge model; that model is not the ECharts implementation
- Strict TypeScript 5.9.3 checking passed for all source/tests, TypeScript examples, and portable SVG audit tools with noUncheckedIndexedAccess, exactOptionalPropertyTypes, and verbatimModuleSyntax. A minimal ambient ECharts stub was used, so this does **not** validate real ECharts types. Vite configuration was excluded; the declared TypeScript 7 workflow remains unverified
- All ten production files other than src/core/plotter.ts match the 351-test SVG checkpoint byte-for-byte, including the entire SVG dependency graph. Its recorded corpus, raster, and visual evidence remains applicable to that unchanged implementation; those checks were not repeated for this browser-contract checkpoint
- The actual declared commands still fail in the offline snapshot: npm test exits 1 because tsx is absent; npm run lint and npm run build exit 127 because local tsc is absent. The build stops before Vite. No dependency installation/download, package/lockfile change, browser session, or CI action was used to obtain these results

Real ECharts rendering, DOM/canvas integration, animation, interaction, the installed-package exports, the declared dependency/build workflow, and CI acceptance remain open gates. The earlier source-direct SVG evidence and these mocked browser-contract tests do not close them.


## Declared-toolchain and packed-package checkpoint: 6cacd37227de

Verified on **2026-10-04 UTC** against
[6cacd37227dec7576dfd649d4a7d1973db83de74](https://github.com/junix/plot-ts/commit/6cacd37227dec7576dfd649d4a7d1973db83de74).
This later checkpoint closes the declared npm/build and packed-entrypoint gaps for
this commit. Earlier offline failures above remain historical records of their
respective snapshots; they are not replaced or reclassified as passes.

### Recovered environment and baseline failures

- The complete original checkout at
  [ba6045e90993](https://github.com/junix/plot-ts/commit/ba6045e909939c305586088d2c0bf87de6e59a99),
  including package-lock.json, contained 65 Git-blob-verified files. Downloads
  used the official npm registry and the lockfile's integrity checks
- `npm ci --ignore-scripts --no-audit --no-fund` installed 412 packages.
  All lifecycle scripts stayed disabled. The installed tool versions were
  Node 24.19.0, npm 11.9.0, TypeScript 7.0.2, tsx 4.23.1, Vite 8.1.5,
  esbuild 0.28.1, and ECharts 6.1.0
- The exact original `npm test` ran 547 tests: **351 passed and 196 failed**.
  The browser harness called `typescript.transpileModule` and
  `typescript.ScriptTarget`, which the declared TypeScript 7 main export no
  longer provides. This was a real compatibility failure, not a missing loader
- Original `npm run lint` and `npm run build` exited 0, but Vite cleared the
  declarations emitted immediately before it. The packed `./svg` export also
  selected the browser root, lacked `SvgFigure`, and required ECharts even for
  a clean SVG-only import. All four added package regression checks failed
  against that original packed artifact

### Bounded repairs and exact acceptance

[7c05907c68ca](https://github.com/junix/plot-ts/commit/7c05907c68cae9e4cad673b4465551ec49152bc1)
changes the test harness to the supported esbuild `transformSync` API with
`loader: 'ts'`, `target: 'es2022'`, and `format: 'cjs'`. esbuild 0.28.1 was
already locked transitively through tsx; it is now explicitly declared as a
devDependency. The TypeScript 7 compiler and the independent `npm run lint`
type-check gate remain unchanged. No older compiler fallback hides failures.

[6cacd37227de](https://github.com/junix/plot-ts/commit/6cacd37227dec7576dfd649d4a7d1973db83de74)
retains the browser ES/UMD/IIFE bundles, adds a separately built pure SVG ES
entry, emits declarations last, and declares types-first export targets and
package contents. It adds the discoverable `npm run test:package` gate.

The final tested candidate matches **all 67 published Git blobs**. Fresh
lockfile installs with scripts disabled also passed from the populated official
registry cache, with no additional network access. Exact final results:

| Command | Result |
| --- | --- |
| `npm test` | 547 passed, 0 failed, 0 skipped: 351 SVG/helper and 196 mocked browser-contract tests |
| `npm run lint` | Exit 0 using the declared TypeScript 7.0.2 compiler and actual installed dependencies |
| `npm run build` | Exit 0; browser ES/UMD/IIFE, independent SVG ES, and declaration files produced |
| `npm run test:package` | Rebuild succeeded; all 4 actual packed-consumer tests passed, none skipped |

The package gate uses `npm pack --ignore-scripts`, extracts the actual tarball
with system `tar` into a fresh temporary consumer, and checks exported files and
both declared entrypoints. SVG runtime rendering and strict NodeNext SVG type
resolution pass before any dependency or DOM is available. The root-entry test
then links only the already installed ECharts dependency and checks the browser
API, SVG namespace, and their TypeScript declarations. Nothing is published and
no dependency is downloaded by this gate.

### Remaining boundaries

- The two entrypoints are separately bundled: cross-entry `SvgFigure`
  constructor identity is not guaranteed. Use a consistent entrypoint and its
  own exported class for `instanceof`; structural/API and declaration
  compatibility are tested, not an ESM singleton-identity contract
- The native `canvas` installation script was **not run**, and native canvas
  execution is not certified. No package lifecycle script was enabled to get
  these passing results; esbuild used its installed platform package
- The 196 browser tests still use the explicit fake ECharts/window/timer
  boundary. Real browser/ECharts rendering, DOM/canvas integration, animation,
  interaction, and CI acceptance remain unverified
- This checkpoint did not repeat the earlier SVG corpus/raster/visual sweep or
  perform a dependency vulnerability audit. Earlier renderer-scope limits and
  bounded numeric/data contracts remain unchanged
