# Bounded local plot-ts provider

`plot-provider-plot-ts` is a separate bundled executable entry. It runs **locally
in Node**, using the existing pure SVG engine. It adds no browser, DOM, ECharts,
canvas, eval, user-JavaScript, subprocess, network, implicit input discovery or
second renderer. Existing library entry points, defaults and SVG bytes are unchanged.
The separate `render-svg-frame-v1` command produces one explicitly requested
[native entry snapshot](plot-provider-frame.md). No command offers HTML, PNG,
an animation player, video or the other six library chart families.

## Build and install

```sh
npm run build
# Run the executable from dist, or install the npm package's bin normally.
dist/plot-provider-plot-ts.cjs describe --json
dist/plot-provider-plot-ts.cjs doctor --json
# Optional small standalone distribution (no npm dependencies at runtime):
npm run package:provider
```

The standalone archive contains only `plot-provider-plot-ts.cjs`, license,
SHA-256 checksums and build provenance. Copy the executable anywhere and invoke it
with Node or through its `#!/usr/bin/env node` shebang. It needs no sibling module,
node_modules, repository, build-on-first-run, package download or network access.
The original npm package still declares its existing browser/chart dependencies;
standalone execution does not imply dependency-free npm installation.

Supported runtime release lines: Node 22 and 24 with `Intl.Segmenter`. Initial
filesystem support is POSIX (Linux tested; macOS implementation uses the same
POSIX APIs but has not received native release testing). Unsupported runtime or
unclean `NODE_OPTIONS`/`NODE_PATH` makes doctor `ok:false` and rejects rendering.
`describe --json` is fixed build metadata; doctor only introspects process features
and reports `ok`/`items`. Neither inspects supplied resources or renders a fixture.
Build provenance embeds the actual source root as `source.local_code_path`, not
consumer cwd. A commit is omitted unless independently verified; source file hashes
and the built script hash are recorded in `plot-provider-build.json`.

## V1: unchanged axes-free supplied-data profile

```sh
plot-provider-plot-ts render-svg figure.json \
  --resource-pins '{"input":"<lowercase SHA-256 of exact figure.json bytes>"}' \
  --output figure.svg --receipt figure.receipt.json
```

Input document: [`plot-ts.svg-figure/v1`](../src/provider/svg-figure-v1.schema.json).
All objects are closed. Figure options are width, height, title, theme,
surfacePolicy, columns and gap. Omitted values are passed through unchanged to the
native engine (800×500, legacy theme, themed-v1, near-square grid and gap 16).
All 14 canonical themes and all three surface policies use the pinned native
registry. Chart order, input order, null gaps and omitted-vs-empty labels survive.
No sorting, inferred theme/unit conversions, resampling or SVG rewriting occurs.

- `column`: aligned category/value arrays, 1–8 series, signed/grouped/stacked,
  native value labels, format and precision
- `line`: aligned numeric x/y arrays, 1–8 series, null gaps and optional area
- `scatter`: x/y coordinates and optional nonnegative size, meaning radius in pixels
- `heatmap`: rectangular finite matrices, signed/constant values, bounded optional
  X/Y labels and viridis/plasma/blues colormap

Column/line names require explicit `legend:"series-names-v1"` and a name for
every series. The [native legend rules](svg-series-legends.md) apply exactly:
full distinct nonblank names, XML-safe Unicode, one row each, bounded estimated
fit, native actual mark paints, no abbreviation or silent loss. Legacy named
lines support at most three distinct paints; choose canonical themes for 4–8.
Names without this profile reject. Known ineffective declared options (`unit`,
line `labels`/`smooth`, scatter `xAxis`, figure `accent`) reject even when empty or
false. Animation configuration also rejects. Unknown fields reject separately.

Strings are XML 1.0-safe Unicode scalars, ≤1,024 scalars/4,096 UTF-8 bytes;
series names additionally obey their stricter native profile. Numbers have finite
IEEE-754 binary64 semantics. Null only represents missing column/line values.
Input must be strict UTF-8 without BOM and one complete duplicate-free JSON value;
escaped duplicate spellings are rejected at every nesting level.

Hard bounds: 4 MiB input, depth 16, 131,072 syntax nodes (every key/value), 16
panels, arrays ≤16,384 unless tighter, 65,536 numeric data scalars total,
16,384 source positions per chart, heatmap axes ≤1,024 and cells ≤16,384.
Column/line positions include nulls. Heatmap rows are nonempty or data is `[]`;
ragged rows, mismatched series lengths and surplus supplied labels reject.
Width/height are `(0,8192]`, columns 1–16, gap 0–1,024, precision 0–12 and
scatter radius 0–1,024. Native computed-domain and actual drawable-geometry checks
still apply. Finite source numbers alone do not guarantee a renderable domain.
SVG ≤8 MiB; receipt ≤256 KiB; no truncation or fallback.

## V1 receipt and shared runtime limits

The closed typed [`plot-ts.render-receipt/v1`](../src/provider/render-receipt-v1.schema.json)
is serialized and checked against its bundled schema before any output is opened.
It contains no paths, basenames, timestamps, titles, arbitrary echoed source,
working directory or self-referential executable hash. Raw original input and
actual emitted SVG are bound by SHA-256 and byte count in the generic
`plot.artifact-receipt-core/v1`. Resolved figure defaults, ordered chart types,
actual legend panels, theme registry and surface policy are explicit.

Per-panel limitations report viewer-resolved/unmeasured fonts, unnamed
order/color series, missing numeric axis tick labels, and heatmap approximate
label fit with full title. `yAxis` only changes native margins/gridlines; it does
not add numerical axis labels. No unit semantics, line labels, smooth curves,
measured text, all-font containment or universal visual-readability certification
is claimed. Static SVG retains legacy inactive grow/fade classes; host CSS may
change embedded appearance.

Runtime evidence records Node, V8, ICU, Unicode, CLDR, platform, architecture and
resolved default locale. Same script/input/arguments with a compatible pinned
runtime/locale and stable ordinary environment is the replay scope. Versions are
evidence, not interpreter hashes or attestation. Heatmap segmentation uses Intl;
viewer font stacks affect pixels.

**Hub snapshot/v2 pins only executable script bytes and raw descriptor.** It does
not pin `/usr/bin/env`, the Node selected through PATH, preloads, interpreter
contents or transitive environment. The trusted launcher must set PATH and clear
unintended `NODE_OPTIONS`/`NODE_PATH` before startup. Script-side refusal is only
hygiene: preloads can already have executed. Application no-network/no-eval code
and descriptor flags are not an OS sandbox. The second capability needs no Hub
renderer or protocol change, but consumers must explicitly discover and select it.

For independent relationship verification, query the *actual execution Hub*
with `plot receipt-core --describe --json`, require the exact generic core feature,
and use that binary/server. The annotation alone is insufficient; old Hubs may
ignore it. The Hub core verifies hash/size/role binding, not the provider's layout,
semantic claims, runtime identity or font readability.

## V2: explicit numeric axes and full literal units

The same executable also advertises `visualization.plot-ts.render-svg-v2`:

```sh
plot-provider-plot-ts render-svg-v2 figure-v2.json \
  --resource-pins '{"input":"<lowercase SHA-256 of exact figure-v2.json bytes>"}' \
  --output figure.svg --receipt figure.receipt.json
```

Its closed document is [`plot-ts.svg-figure/v2`](../src/provider/svg-figure-v2.schema.json).
Every column, line or scatter panel requires `axes:"numeric-axes-v1"`.
Heatmap retains exactly its categorical V1 contract, with no axes or unit fields;
it may appear alone or beside quantitative panels in the same independent grid.
The [complete mixed example](../examples/provider-numeric-axes-v2.json) includes
signed stacks, nullable line/area series, scientific scatter and an unchanged heatmap.
There is no schema sniffing, automatic upgrade, per-panel fallback or inferred axes.
`render-svg` rejects V2 documents and `render-svg-v2` rejects V1 documents.

- Column receives numeric Y ticks and optional literal `unit` text
- Line and scatter receive numeric X/Y ticks, optional Y `unit` and X `xUnit`
- `yAxis` must be omitted or `true`; scatter `xAxis` also accepts only `true`
- Column/line `xAxis`, column `xUnit`, heatmap axes/units, smoothing, line value
  labels, HTML, motion and animation remain unsupported, even when false or empty
- A supplied unit must be nonblank XML-safe, single-line Unicode: at most 128
  scalars and 512 UTF-8 bytes. Leading/trailing/repeated spaces are preserved
- No trim, normalization, translation, rescaling, inferred unit, conversion or
  shared exponent is introduced. A percent unit does not multiply observations
- Column `format`/`precision` affect its old value labels only. Those can round
  scientific values to zero or disappear below the height threshold; use
  `labels:false` when such labels would mislead. Scatter size remains pixel radius

The same source budgets and figure defaults apply to both commands. V2 dispatches
directly to the existing native figure/chart implementation: one renderer and one
native domain/guide plan. There is no provider-side scale calculation, alternate
layout, SVG patching or second render. All supplied X entries, null gaps, series
order, signed stack endpoints and omitted options keep their native meaning.
See [numeric axes](svg-numeric-axes.md) for exact domain, tick and fit rules.

Native domain or layout ineligibility returns path-free `native_render_rejected`
and publishes neither success artifact. Finite data alone does not guarantee
renderability: maxima below data, overflowing domains/totals, colliding required endpoint
or zero ticks, unfittable full units, large marker clearance and too-small final
plots reject. A larger panel, fewer columns/legend rows or user-chosen shorter
units can help ordinary crowding. These remedies are never applied automatically.

### V2 receipt and limitations

The separate closed [`plot-ts.render-receipt/v2`](../src/provider/render-receipt-v2.schema.json)
uses profile `plot-ts-svg-static-numeric-axes/1` and the same generic artifact core.
`figure.numeric_axes_panels` lists every quantitative panel exactly once in figure
order, skips heatmaps and is empty for heatmap-only figures. Each record contains
`panel_index`, matching `chart_type`, `profile:"numeric-axes-v1"`, `axes:"y"` for
column or `"xy"` for line/scatter, and supplied `unit_axes` in fixed Y-then-X order.
This is validated requested profile/unit-presence metadata after successful
rendering, not reconstructed domains, emitted tick counts or measured text bounds.
Unit strings, names and titles are not echoed; original input and actual SVG
hashes bind those bytes. Closed-schema and full semantic correspondence checks
run before publication.

Every quantitative panel reports `system-fonts-unmeasured`,
`numeric-axes-fit-approximate`, `numeric-axes-interior-ticks-fit-dependent` and
`binary64-and-svg-coordinate-rounding`, in that order. Unnamed column/line series
then report `order-color-series-without-legend`. Every column also reports
`column-category-label-fit-unmeasured`, followed by
`column-value-labels-rounded-and-height-conditional` unless `labels:false`.
Heatmaps retain only `system-fonts-unmeasured` and
`heatmap-label-fit-approximate-with-full-title`. These are potential losses, not
claims that thinning, rounding or label omission actually occurred. V2 never
reports `numeric-axis-labels-unavailable` and does not claim whole-figure losslessness.

Both receipts retain live, viewer-resolved and unmeasured fonts. No fonts are
embedded. Native numeric-axis niceness now parses complete decimal candidates
and always selects an outward finite bound, or rejects if none is available.
The previously runtime-dependent singleton scatter Y `0.00003` now succeeds with
exact Y domain `[0.00003, 0.00003]` on tested Node 22.22.1 and 24.19.0. The provider
inherits the native fix without a separate domain repair. Full actual tick labels
are retained; observations, explicit maxima and receipt semantics are unchanged.
This does not promise arbitrary-input, cross-runtime or all-font pixel parity;
pin the runtime and font environment for reproducibility. The generic Hub core
checks bindings, not provider semantics.

The subsequent [small-line domain correction](verification-svg-small-line-domains-2026-10-05.md)
removes the unit-sized Y maximum floor only for numeric-profile lines. Static V2
and entry-frame rendering inherit the same native domain: small positive data
uses its outward decimal maximum; negative-only data ends at zero; valid
explicit fractional or zero maxima remain exact. Empty/all-zero inferred line
input retains `[0, 1]`. V1 and omitted-profile legacy output remain unchanged.

The fix changes executable bytes and needs an explicit execution-pin refresh.
This release build also changes the descriptor's local source-path provenance,
so the raw describe pin changes; the command objects do not.
The V1/V2 machine-input schemas, receipt schemas and descriptor command contracts
are unchanged. A stale executable snapshot must not be silently accepted.

### Discovery and explicit pin refresh

V1 command-object bytes, document/receipt schemas and validation semantics remain
unchanged. The provider ID, describe schema and protocol version remain unchanged;
root operations become exactly `render-svg`, `render-svg-v2`. The whole executable
and raw descriptor nevertheless change, so an older full execution snapshot must
reject them even when invoking V1. Deliberately run the execution Hub's
`refresh --pin-execution` workflow to approve and bind the new executable/descriptor;
never silently refresh or reuse the old script's provenance. Preflight the actual
execution Hub's complete `plot.artifact-receipt-core/v1` support, discover the exact
V2 capability and select it explicitly. Existing V1 routes remain V1.

## Filesystem/publication contract

One explicit regular input file; no stdin, URLs, devices, FIFO, configuration,
resource references or parent creation. Explicit symlinks to regular input are
allowed using native filesystem semantics, including `symlink/..`. Nonblocking
opens avoid waiting on a swapped FIFO. Original spelling, resolved target,
parent/file identities, bounded bytes and digest are retained and rechecked.

Both destinations must have existing canonical parents. Input/output aliases,
identical outputs, existing symlink/nonregular/multiply-linked leaves reject.
Existing ordinary destination permissions are preserved. Existing SVG/receipt
files must themselves fit their respective 8 MiB/256 KiB bounds to permit a
bounded captured-old-output check; oversized old destinations reject unchanged.

Complete SVG and checked receipt are prepared in memory. Both are staged at
exclusive fresh names, written/fsynced/closed and re-read. Immediately before
publication, inputs, destinations, parents, stages and aliases are rechecked.
Retained backups permit paired rollback on normal publication errors. Only owned
stage/backup names are cleaned; recovery data remains if rollback itself fails.
No SVG is streamed to stdout. Errors are bounded path-free JSON diagnostics.

This is rollback-capable ordinary-filesystem publication, **not two-file
crash-atomic or hostile-writer race-free**. Durable changes are detected; malicious
change-and-restore races cannot be excluded. Filesystem calls on hung storage and
synchronous rendering have no portable hard deadline; enforce process cancellation
outside the provider. JSON/data/output budgets bound ordinary work.

## Tests

`npm test`, `npm run lint`, `npm run test:package`, and `npm run test:provider`.
Provider tests cover strict parser/schema negatives, all-theme/surface direct
native parity, budgets, path/pin/alias/FIFO failures, mutation, paired rollback,
closed receipts, standalone/packed command behavior and preload limitations.
Package tests extract the real tarball into a clean consumer and materialize its
bin mapping without installing its unrelated browser dependencies. Native raster
proofs verify representative supplied four-family arrays and independent grids;
they are not browser or all-runtime pixel certification.

For the small numeric-provider native release proof after building, run
`node --test tests/native-provider-numeric-axes.test.mjs` with the existing
`rsvg-convert` on PATH (or set `PLOT_TS_RSVG_CONVERT`). Optional
`PLOT_TS_PROVIDER_AXES_EVIDENCE_DIR` retains bounded evidence. See the
[dated verification record](verification-provider-numeric-axes-2026-10-05.md).

## Separate static scaled-axis command

`render-svg-scaled-v1` exposes only native scaled line/scatter through a new
closed input/receipt pair. It does not expand any input described above. See
[the scaled provider contract](plot-provider-scaled.md) for exact schemas, scalar
slot budgets, receipt evidence and mandatory deliberate executable/describe pin
refresh. Scaled frame rendering remains outside the machine contracts.
