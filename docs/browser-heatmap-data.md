# Browser heatmap data contract

`Figure.heatmap(data, xLabels = [], yLabels = [], config = {})` accepts a
rectangular array of rows containing only finite numbers. All rows must have
the same number of columns. Ragged rows, sparse rows/cells, `NaN`, infinities,
and nonnumeric values throw `RangeError`. Empty matrices (`[]`) and rectangular
zero-column matrices (`[[]]`, `[[], []]`) are allowed.

The complete matrix and both label arrays are checked before adding a series or
changing either axis. A failed call leaves existing series, their IDs, axis
configuration, and the rendered options unchanged. A later valid call can be
made normally. Cell values and normalized labels are copied during the call, so
later mutations to the caller's arrays do not change the staged heatmap.

## Labels

Each axis has exactly as many categories as its matrix dimension. Both label
arguments must be arrays of strings, including any entries beyond the matrix
shape; sparse arrays or nonstring entries throw `RangeError`.

- Omitted or empty arrays generate string indices (`'0'`, `'1'`, …)
- A nonempty array annotates matching rows or columns in order
- Missing annotations are blank strings; extra annotations are ignored
- Explicit empty strings stay blank

This partial-label policy follows the documented SVG column-label behavior,
while preserving the browser's existing automatic labels for omitted/empty
arrays. It is applied consistently to browser rows and columns. Short label
arrays therefore no longer shorten the category axis, and extra labels no
longer create categories beyond the matrix.

```ts
fig.heatmap([[1, 2, 3], [4, 5, 6]], ['First'], ['Top', 'Bottom', 'unused'])
// X categories: ['First', '', '']
// Y categories: ['Top', 'Bottom']
```

## Shared color domain

The browser uses one visual map across its heatmap series. Its data range is the
minimum and maximum across all heatmap cells, excluding unrelated chart types.
Multiple heatmaps also share the Figure's axes; the most recently added
heatmap supplies their category labels. This does not provide separate grids.
Use separate Figures when heatmaps need independent axes or color scales.

Domain calculation scans values directly rather than spreading them into
`Math.min`/`Math.max`, avoiding JavaScript's function-argument-count limit. There
is no library-imposed cell-count cap; available memory and ECharts rendering
cost still limit practical sizes.

- If every heatmap is empty, the visual-map domain is `0..1`
- A nonconstant domain preserves its actual finite minimum and maximum
- A constant value uses symmetric padding of the larger of `1` and `1%` of its
  absolute value
- If that padding would produce an infinite bound near `±Number.MAX_VALUE`,
  that side stays at the original value and the other side is padded

Constant-domain bounds are finite and distinct and contain the original value.
The series data itself is not changed. Empty heatmaps do not expand the domain
of a nonempty one.

## Verification scope

`tests/browser-heatmap-validation.test.ts` invokes the actual browser `Figure`
implementation through the repository's shared mocked-ECharts helper. It checks
rejected input atomicity, finite/empty/constant domains, label dimensions and
ownership, mixed-series domains, repeated updates, and a 150,000-cell matrix.
The existing lifecycle, axis, streaming, and row-label tests remain applicable.

These checks verify the options emitted by the wrapper, not pixels, colors, or
ECharts' internal arithmetic. Opposite-sign finite extremes can still have an
overflowing numeric span; this contract does not prove every ECharts calculation
safe for all finite numbers. Browser rendering, real ECharts types, dependency
builds, and CI require separate verification. SVG rendering is unchanged.

### Local verification record, 2026-10-03

Verified the combined palette and data-validation implementation against parent
`315de7960e396e7cd9bb292b47a11fcefd83fe54`:

- All 53 new browser-data contract tests passed
- All 547 standard tests passed (442 existing, 52 palette, 53 data validation)
- The separate 13 published SVG audit witnesses also passed, for 560 total
- The same 560 tests passed using Node 24.19.0 with esbuild 0.27.7 CommonJS
  bundles and using Bun 1.3.14 directly on TypeScript sources
- TypeScript 5.9.3 passed all source, test, TypeScript example, and portable SVG
  audit files with strict checking, `noUncheckedIndexedAccess`, and
  `exactOptionalPropertyTypes`; a minimal ambient ECharts declaration was used,
  and Vite configuration was excluded

The new tests were also run against the unchanged parent browser source:
Node produced 50 failures and 3 compatibility passes; Bun produced 49 failures
and 4 compatibility passes. The difference is the 150,000-cell argument-spread
witness: the old implementation overflows Node's argument stack, while this Bun
version accepts that many arguments. Both runtimes pass it with iterative
extrema. The other witnesses establish rejection, atomicity, label shape,
input ownership, and empty/constant/shared domains.

No dependencies were installed. The declared `npm test` workflow was blocked
by missing `tsx`; `npm run lint` and `npm run build` were blocked by absent local
`tsc`, before Vite ran. These alternate-toolchain checks are not a successful
run of the declared dependency/build workflow, real ECharts integration, or CI.
