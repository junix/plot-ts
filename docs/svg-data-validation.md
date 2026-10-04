# SVG numeric-data and option boundaries

These are local fail-fast contracts for the pure SVG API (`figure()` from
`plot-ts/svg`, or `src/svg/index.ts` in the repository). They apply when `render()` runs, including inside composed
figures. A failing chart throws a `RangeError` before `render()` can return an SVG;
it does not return a partial chart or silently replace invalid observations.

| Chart | Required data | `RangeError` message |
| --- | --- | --- |
| Heatmap | Every cell is a finite number | `Heatmap values must be finite` |
| Heatmap | Every row has the same length as the first row | `Heatmap data must be rectangular` |
| Waterfall | Every step is a finite number | `Waterfall values must be finite` |
| Waterfall | Categories and values have equal counts | `Waterfall categories and values must have equal lengths` |
| Donut | Every item's value is finite | `Donut values must be finite` |
| Donut | Every item's value is non-negative | `Donut values must be non-negative` |
| Radar | Every supplied series value is finite | `Radar values must be finite` |
| Radar | Every supplied series value is non-negative, including extras | `Radar values must be non-negative` |
| Radar | Every explicit axis maximum is finite and positive | `Radar maximum must be finite and positive` |
| Gauge | A supplied `bands` option is an array | `Gauge bands must be an array` |
| Gauge | Every custom band has finite numeric `from` and `to` endpoints | `Gauge band endpoints must be finite` |
| Gauge | Every custom band satisfies `0 <= from <= to <= maximum` | `Gauge band endpoints must satisfy 0 <= from <= to <= maximum` |
| Slope | Both endpoints of every item are finite | `Slope endpoints must be finite` |
| Scatter | A point with finite x and y has a finite, non-negative size | `Scatter size must be finite and non-negative for finite coordinate pairs` |

“Finite” requires a number and excludes `NaN`, `Infinity` and `-Infinity`.
Non-negative includes `0` and `-0`; positive maxima exclude both. These checks do not mutate the
input arrays. If more than one requirement is violated, callers should not depend
on which violation is reported first.

## Preserved behavior

- Existing non-negative donut/radar data and valid gauge bands retain their
  geometry. Other chart families retain their existing signed-data contracts
- Empty valid inputs retain their previous output. `[]`, `[[]]` and `[[], []]` are
  valid empty heatmaps; `[[], [1]]` is ragged and is rejected. An empty waterfall
  requires both lists to be empty
- Radar series may have fewer values than axes; missing trailing values and sparse
  entries retain their zero fallback. Extra finite non-negative values remain ignored by visible-axis normalization
  and geometry. All supplied values, including extras, must still be finite and
  non-negative
- Scatter still omits a point if either coordinate is nonfinite. Its omitted
  point's size is not checked. Size defaults to `4`; `0` and `-0` are allowed.
  Static SVG retains original animation indices for rendered points; bounded
  [entry motion](svg-entry-motion.md) uses rendered ordinals instead. Size is the circle
  radius in pixels. [Marker-aware bounds](svg-scatter-bounds.md) expand insufficient
  insets, or reject an oversized radius when no positive drawable area remains
- Line retains its existing finite-pair omission and gap behavior

For example, a scatter point `{ x: NaN, y: 1, size: -1 }` is omitted, while
`{ x: 0, y: 1, size: -1 }` causes `render()` to throw. Likewise, a radar series with
`values: [1]` may still be rendered against three axes; `values: [1, NaN]` may not.

## Intentional sign and option contract changes

The SVG donut renderer models non-negative shares of a total. The SVG radar
renderer models non-negative radii on axes beginning at zero; it does not provide
signed-axis semantics. Earlier versions returned SVG for finite negative donut
and radar values, but that did not establish a meaningful signed interpretation.
These inputs now intentionally throw, including cancelling donut values such as
`[-1, 1]` that previously returned an empty chart. This is a behavior change,
not a backward-compatible validation cleanup. Callers must supply data that
already fits the chosen chart; the renderer does not take absolute values, drop
negative observations, shift the scale, or assign a new statistical meaning.

Radar maxima have an equally explicit contract change: a supplied `axis.max`
that is zero, negative, nonfinite or nonnumeric now throws instead of silently
using the inferred scale. Omitted maxima (or runtime `undefined`) still use one
shared inferred maximum across all series and declared axes, with `1` for empty
or all-zero data. Valid explicit per-axis maxima still override that scale and
retain the existing upper-radius clipping. Validation runs even with no series
or observations. Sparse/missing values retain their zero fallback; explicitly
supplied invalid values do not count as missing.

Custom gauge bands are coordinates in the resolved `0..maximum` scale. Endpoints
must be finite numbers with `0 <= from <= to <= maximum`. Reversed or out-of-range
bands now throw rather than drawing uncontrolled arcs. A missing, nonnumeric or
nonfinite endpoint, a missing/null band, or a sparse entry throws the endpoint
error. A non-array `bands` value, including `null`, throws the array error.

Omitting `bands` (or using runtime `undefined`) retains the default three bands;
`[]` draws none. Zero-length bands remain accepted at any point on the scale,
including both endpoints, and retain their existing zero-area path. Gaps,
overlaps, unsorted band lists, colors and drawing order are preserved: validation
does not merge, sort, clamp or normalize them. Bounds use the resolved maximum,
including the `0..1` fallback for a zero gauge value. The gauge value's existing
finite-input, explicit-positive-max and pointer-clamping rules are unchanged.
This is endpoint validation, not a CSS/SVG paint parser or global object schema.

The old signed-input and invalid-maximum regression cases remain in the test
suite as documented before/after witnesses. Positive values, zeroes, missing
radar entries, explicit positive maxima, ordinary/default gauge bands and wide
252-degree bands remain covered by the original geometry tests.

## Earlier numeric-data checkpoint (historical)

`tests/svg-data-validation.test.ts` exercises the exported fluent source API. It
originally contained explicit assertions for the twelve malformed-SVG witnesses from the
bounded 118-case audit, plus the corresponding ragged-long heatmap and extra-value
waterfall shape contracts. Further cases cover each nonfinite number alone and
among valid values, both slope endpoints, radar extras and partial/sparse values, empty
data, signed/constant/zero controls, scatter omission/default/zero sizes, line
gaps, render-time validation, composition, determinism and input preservation.

With the project's dependencies already installed, the intended commands are:

```sh
npm test
npm run lint
```

An existing Bun can also exercise these source tests without installing anything:

```sh
bun test tests/svg-data-validation.test.ts
```

The supplemental offline check used the available Node/esbuild, Bun and strict
TypeScript 5.9 tools. Against the `12d3e7d` source baseline, all twelve original
malformed-SVG regression assertions fail because no exception is thrown. With the
validation guards, all pass. The 118-case replay rejects these twelve inputs plus
the long-ragged heatmap and extra-value waterfall; prior gauge/pyramid rejections
are retained. Every still-rendered case is byte-identical to that baseline, and
Node/Bun outputs agree. The unrelated empty-heatmap-label and option repairs are
validated separately when changes are combined.

The final combined candidate on `efad666` passes 327 source tests in both Node
and Bun, plus the strict TypeScript 5.9 source/test/example check. Its 94 returned
audit SVGs all parse with no known numeric/missing-fill defect and rasterize
pixel-identically to `efad666`; the twelve original bad outputs are replaced by
clear errors. The eight example artifacts (six SVGs and two HTML files) also remain
byte-identical across the baseline/candidate and Node/Bun.

These source-level results do not certify the declared npm/tsx/TypeScript 7/Vite
workflow, installed-package exports, a browser engine, or CI. They are not a global
schema validator or a guarantee for every finite IEEE-754 magnitude. Arithmetic
overflow, scale/configuration options, dimensions and other chart families are
outside this narrow data-boundary change.


## Sign/option contract verification

`tests/svg-option-contracts.test.ts` exercises the sign/max/band errors, runtime
malformed endpoints, zero/negative-zero, radar extras and missing entries,
empty-series maxima, inferred gauge bounds, zero-length/overlapping/gapped bands,
render-time mutation, composition, determinism, and input preservation. The
updated legacy tests explicitly record which previously accepted inputs now
reject. `tests/package-exports.test.mjs` checks the same public error contracts
through the actual packed `plot-ts/svg` entry with no DOM or runtime dependency.

Run `npm test`, `npm run lint` and `npm run test:package` with the declared
dependencies. The sign/option verification section in
[the checkpoint report](verification-2026-10-03.md#svg-signoption-contract-checkpoint-2026-10-04)
records the bounded before/after evidence. Existing historical test counts and
snapshots above describe their original checkpoints, not the current contract.


## Computed numeric-data domains

The later [computed-domain contract](svg-data-domains.md) additionally rejects
unrepresentable spans, required nice bounds, partial totals and mapped
coordinates for extreme finite inputs. It preserves accepted arithmetic and
explicit radar/gauge clipping. The earlier scope statements and test counts
above describe their historical checkpoints; see the
[separate numeric-domain verification](verification-svg-data-domains-2026-10-04.md)
for current evidence.
