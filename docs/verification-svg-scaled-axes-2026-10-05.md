# Native positive logarithmic axes — 2026-10-05

Baseline: `junix/plot-ts` main at
`a71339de06c851704c3d68125b0cb46bf7d8439c`, freshly verified before implementation
and again before the final build. No publication, remote CI, browser playback,
external dependency installation or Hub capability expansion is part of this
verification.

## Delivered scope

Native line/scatter add explicit `axes: 'scaled-axes-v1'`, independently linear or
positive log10 X/Y scales, exact observed extents, and exact optional domains.
All positions, guides and horizontal grids share one scale map. Positive decades
have equal spacing. Invalid log values reject rather than disappear; only null
line Y makes a gap. Strict aligned series, explicit option rejection and bounded
per-panel work are documented in [native scaled axes](svg-scaled-axes.md).

Existing `numeric-axes-v1`, omitted-profile SVG, motion, browser/ECharts behavior
and all existing machine contracts remain unchanged. This is a native capability,
not an admitted Hub logarithmic capability. Lines remain static in entry frames;
scatter retains bounded fade/rise. Node-canvas/librsvg consume the real native SVG.

## Exact-path release gates

Node 22.22.1 and Node 24.19.0 each passed at the final source/build path:

- Type checking and complete ESM/IIFE/UMD, SVG, declaration and provider builds
- 1,222 source tests (1,197 baseline plus 25 new test groups)
- 34 packed export/provider/source-provenance tests (32 baseline plus two groups)
- 226 native tests: 214 existing canonical/canvas/scatter/motion/legend/surface
  checks, eight existing numeric/provider/frame checks, and four new log groups
- All 55 existing native browser-surface checks, run in verified per-theme
  process shards plus the seven remaining cases to bound native memory

The new native groups include six actual semilog-X/Y and log-log line/scatter
fixtures, 90 theme/surface/family raster cases, static guide bands during repeated
scatter frame seeks, direct node-canvas SVG decoding, and subnormal/extreme
positive examples. They sample actual native mark pixels as well as emitted
geometry. Twenty-two unique retained SVG/PNG artifacts and all their measurements
match byte-for-byte across the two runtimes. Repeated time-zero evidence writes
are separately recorded with the same identity.

All five JavaScript bundles, including the standalone provider, match between
Node 22 and Node 24 builds at the same path. The build sidecar records the actual
runtime independently. Every old golden, provider source/schema and command
fixture remains byte-identical. White-background raster inspection confirmed
legible full labels, domains, units, grids, spacing and the line legend; original
SVGs retain their requested transparency.

## Independent review and the regression it caught

The initial floating-point atanh kernel was accurate to a loose tolerance but
could reverse adjacent logarithms at an exponent boundary. A denominator of
`4.766827154468641e-57` and adjacent numerators
`1.0195788231247693e-56`, `1.0195788231247695e-56` exposed a contained scatter point
being rejected. The issue was repaired with fixed-point integer arithmetic,
without endpoint clamping or dropped observations. That exact renderer witness
and additional monotonic boundary cases are committed regressions.

The final kernel uses 256-bit fixed point and exactly 96 atanh terms; the reviewed
conservative pre-conversion absolute error bound is below 2^-230. The documentation
separates that error from final binary64 division and two-decimal SVG rounding.
The committed 443-case Decimal reference uses 180 digits and exact binary inputs;
its tests allow at most 2*Number.EPSILON relative log-ratio error and
4*Number.EPSILON absolute normalized-fraction error.

Independent checks on the final source include:

- 850,000 neighboring/exponent/close-far boundary comparisons: zero reversals or
  out-of-range fractions after the fix (the first implementation had 1,716)
- 8,216 scalar ratios against 110-digit exact-binary Decimal reference: maximum
  error 0.500 ulp; 16,112 fractions: maximum absolute error 2.408e-16
- Node 22/24 numerical result arrays identical
- 5,130 old SVG/HTML/frame output comparisons per runtime, all byte-identical
- Six independent PNG fixtures per runtime, with 39 actual mark-pixel samples,
  30 frame checks, 185 invalid-input rejections and 48 edge-case renders
- 36 actual standalone V1/V2/frame log-option rejections and six old-document
  byte comparisons per runtime; rejected writes retain old SVG/receipt pairs
- Twelve budget/early-rejection checks, including throwing coordinate getters,
  exact boundaries, null counts, legacy 65,537-point acceptance and the unchanged
  independent 2,048-target intermediate-motion limit

## Bounded cost, measured rather than assumed

Only the new profile limits a panel to 65,536 scatter positions, or 65,536 X
entries, 256 line series and 65,536 summed Y positions including nulls. Checks
precede expensive scale/data work. There is no persistent cache or cross-render
memoization. Existing native profiles and provider budgets are untouched.

The checked-in performance script renders all-unique X/Y values with both axes
logarithmic, at 800×500, excluding rasterization. One final run measured:

| Positions | Node 22 line | Node 22 scatter | Node 24 line | Node 24 scatter |
|---:|---:|---:|---:|---:|
| 1,000 | 52.2 ms | 45.9 ms | 49.4 ms | 60.5 ms |
| 10,000 | 319.8 ms | 464.6 ms | 346.5 ms | 354.6 ms |
| 16,384 | 585.1 ms | 740.5 ms | 503.2 ms | 578.3 ms |
| 65,536 | 2204.1 ms | 3466.2 ms | 2117.8 ms | 2300.5 ms |

These are local elapsed observations, not latency promises. The 65,536-point
scatter produces 6,735,517 SVG bytes; output/raster costs are additional. Limits
are per panel, and figure cost accumulates across panels. Original unbounded
profiles keep their original behavior.

## Source provenance and unchanged provider admission

Native source-set SHA-256:
`f15171054f6a55a7a0675599266589da9b6ddf9e1920548103a68deace3fd701`.
Standalone executable SHA-256:
`e0afeb0479bc0ba7f9ebc3a1e0161f1134ce95740bdc79dbb91e67ab0b7e089c`.

The four changed/added consumed native files are `src/svg/charts.ts`,
`src/svg/index.ts`, `src/svg/numeric-axes.ts` and `src/svg/scaled-axes.ts`.
All 18 provider source/schema files, all three complete command fixtures and
all six machine schemas are unchanged. Current receipts bind the actual updated
native source set. Existing execution/raw-describe pins must refresh deliberately
for rebuilt bytes, even for unchanged exposed commands. A source digest is not
a claim that a logarithmic command has been admitted.

## Reproduction and limits

Run `npm run lint`, `npm test` and `npm run test:package`. After building, run the
native `*.test.mjs` suites with an installed `rsvg-convert` via
`PLOT_TS_RSVG_CONVERT` or PATH, and `--import tsx` for suites importing TS helpers.
Use a writable font cache. New log raster evidence can be retained with
`PLOT_TS_SCALED_EVIDENCE_DIR`; its file-byte budget is below 2 MiB. Regenerate the
independent reference with `python tools/verification/scaled-axes-reference.py`;
measure local costs with `node tools/verification/scaled-axes-performance.mjs`.

These gates establish the tested native Linux/Node/font environment, not
live-browser animation, other operating systems, arbitrary font/glyph fidelity,
arbitrary-real arithmetic or a whole-figure performance guarantee. No old
snapshot or command/schema fixture was regenerated to conceal a mismatch.
