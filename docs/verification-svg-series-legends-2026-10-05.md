# SVG series-name legend verification — 2026-10-05

## Scope and baseline

Base commit: `b23ca8a772c0820949712c8d022c98590e0afb06`. All 122 tracked
baseline file blobs were compared to the freshly fetched, untruncated recursive
tree before this source-only candidate was prepared. Existing generated files
were not reused. No runtime dependencies were added or installed.

This unit adds the explicit `series-names-v1` profile to SVG column and line
charts. It preserves the original renderer bodies behind an omitted-option fast
path. It adds no provider, axis/units behavior, new motion, font measurement or
browser rendering changes. The public contract is [svg-series-legends.md](svg-series-legends.md).

## Executed gates

- Node 24.19.0: TypeScript no-emit check passed; all 1,092 normal tests passed
- Node 22.22.1: all 1,092 normal tests passed
- Fresh Vite browser/SVG bundle build and declaration emission passed on Node 24
- Real `npm pack` clean-consumer checks: 12/12 passed on each Node runtime,
  including root `svg`, standalone `plot-ts/svg`, accepted/rejected option types,
  no-DOM/no-runtime-dependency SVG execution and exact final/reduced frame output
- All 265 pre-existing native checks passed on Node 24, using the native canvas
  binding and built bundles. This includes the existing entry-motion tests
- Four new real `rsvg-convert` legend tests passed on each Node runtime

The first aggregate native command omitted `--import tsx`, which the existing
scatter-padding source-import test requires. It failed module resolution while
229 other tests passed. The entire aggregate was rerun with the documented loader
and passed 265/265; no product code or test assertion was changed to resolve it.

Reproduction:

```sh
node node_modules/typescript/bin/tsc --noEmit
node --import tsx --test --test-concurrency=1 tests/*.test.ts
npm run build
node --test --test-concurrency=1 tests/package-exports.test.mjs
node --import tsx --test --test-concurrency=1 tests/native-*.test.mjs
```

The last command requires a real `rsvg-convert` on PATH, or its explicit path in
`PLOT_TS_RSVG_CONVERT`, plus the existing optional native canvas dependencies.
Set `PLOT_TS_LEGEND_EVIDENCE_DIR` to retain the new SVG/PNG artifacts and hashes.
A writable Fontconfig cache can be selected with `XDG_CACHE_HOME`.

## Exact compatibility and semantics

The focused suite adds 15 tests. It checks 180 explicit-legend golden hashes
across legacy plus 14 canonical themes, all three surface policies, signed
grouped/stacked columns, nullable non-collinear lines/area and independent panels.
Another 180 hashes were generated from the untouched baseline with names supplied
but the profile omitted. Those hashes match the new code. All existing goldens,
including the 585 static entry-motion baseline cases, remain unchanged.

The suite also checks full escaped source-order names, exact reduced-height body
markup, actual column opacity/line color, legacy line repetition rejection,
canonical eight-series acceptance and nine-series rejection, strict names and
profiles, source immutability, fractional width fits, title/panel reservations,
real drawable minimums, extreme finite height precision rejection, all entry
paths and 2,048/2,049 motion-target boundaries. Legend-reduced height determines
whether value labels actually enter the target count.

One deliberate layout refinement rejects tabs, CR/LF, U+2028 and U+2029 instead of
allowing SVG to normalize or split those names. Ordinary repeated/edge spaces are
preserved. Full names never receive an ellipsis or a fallback smaller font size.

## Native pixels and limits

The new gate used native `rsvg-convert 2.60.0` on Linux x64. It retained 17 SVGs
and 17 PNGs on each runtime. Every recorded artifact size/hash was rechecked and
all 34 SVG documents were parsed as XML. Grouped/stacked plot-region pixels match
the direct reduced-height reference; legend-band pixels are identical at 0, 150,
600 and 1,600 ms. Reduced-motion pixels equal final output. A legacy fourth-series
column swatch has half alpha, while canonical transparent swatches retain their
actual opaque series color without an automatic legend backing.

The actual built-bundle pixels were visually inspected for signed grouped and
stacked columns, CJK/markup-like names, nullable line/area, a narrow 160px panel,
and a titled two-panel figure. The inspected full names and swatches are readable
in this native/font environment. These checks do not measure fonts or establish
universal glyph containment, all-script readability, browser CSS playback, or
cross-platform pixel parity.

All new PNGs and recorded pixel measurements matched between Node 22 and 24.
One intermediate SVG contained a one-digit difference in an existing value-label
fade opacity: `0.5975277415710778` versus `0.5975277415710779`. The same difference
was reproduced in untouched baseline code at the same reduced plot height. The
legend subtree, static/final/reduced SVG and raster were unchanged. This unit does
not claim intermediate motion byte equality across Node/V8 versions and does not
modify the existing motion arithmetic.

No real browser acceptance or remote CI was performed as part of this local gate.
