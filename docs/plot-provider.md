# Bounded local plot-ts provider

`plot-provider-plot-ts` is a separate bundled executable entry. It runs **locally
in Node**, using the existing pure SVG engine. It adds no browser, DOM, ECharts,
canvas, eval, user-JavaScript, subprocess, network, implicit input discovery or
second renderer. Existing library entry points, defaults and SVG bytes are unchanged.
This static release does not offer a frame command, HTML, PNG, animation player,
video or the other six library chart families.

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

## Exact supplied-data profile

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

## Receipt, runtime identity and actual limits

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
and descriptor flags are not an OS sandbox. This release adds no Hub changes.

For independent relationship verification, query the *actual execution Hub*
with `plot receipt-core --describe --json`, require the exact generic core feature,
and use that binary/server. The annotation alone is insufficient; old Hubs may
ignore it. The Hub core verifies hash/size/role binding, not the provider's layout,
semantic claims, runtime identity or font readability.

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
