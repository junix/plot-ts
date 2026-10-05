# SVG full named-series legends

`ColumnChart` and `LineChart` accept `legend: 'series-names-v1'`. Each existing
`series[].name` then identifies that series in a static key below its panel. The
same implementation is used by direct `renderColumn`/`renderLine` calls,
`SvgFigure.render()`, `renderHtml()`, `renderFrame()`, the root `svg` namespace,
and the dependency-free `plot-ts/svg` runtime export.

```ts
import { figure } from 'plot-ts/svg';

const report = figure({ width: 600, height: 360, theme: 'sage' })
  .bar({
    categories: ['甲', '乙'],
    legend: 'series-names-v1',
    series: [
      { name: '实测 & <A>', values: [9, -6] },
      { name: '预测', values: [-4, 3] },
    ],
  });
const svg = report.render();
```

## Explicit compatibility boundary

Omit `legend` to retain the exact prior bytes, geometry, validation and behavior.
Existing names remain ignored unless the profile is requested; even malformed
names do not create new failures on the omitted path. Explicit `undefined` is
also omission. `null`, booleans, aliases and unknown versions reject. No legend is
inferred from the presence of a name. Radar and other chart families do not yet
support this option.

This feature identifies series; it does not add units, numeric axis tick labels,
line value labels, smoothing or new motion. The existing `yAxis` behavior remains
unchanged. There is no inferred theme or provider-specific palette.

## Complete name or error

Under the profile:

- Supply 1–8 series, each with a nonblank string name
- Names must be exactly distinct, without trimming, normalization or deduplication
- Each name is limited to 128 Unicode scalars and 512 UTF-8 bytes
- Names must be valid Unicode scalar sequences and XML 1.0 text; lone surrogates,
  illegal controls, U+FFFE and U+FFFF reject
- The single-row layout rejects tabs, CR/LF, U+2028 and U+2029. SVG can normalize
  these or break the line, so they cannot faithfully represent a one-row name
- Leading, trailing and repeated spaces are retained using `xml:space="preserve"`
- XML-significant characters are escaped, not interpreted as markup
- The full estimated name advance must fit the panel's allocated row, or an error
  requests a wider panel or a shorter name. There is no ellipsis, wrapping,
  abbreviation, arbitrary font-size shrink or silently omitted legend

Empty data can still have a named series and legend. Zero series reject under the
profile. Nonfinite/missing chart-data behavior remains that of the existing body.
These name restrictions do not apply when `legend` is omitted.

## Per-panel layout and typography boundary

Each legend has one source-ordered row per series, fixed 11px text, 18px row pitch,
8px outer padding, a 12px swatch at x=8 and a label at x=28. The right padding is
8px. It reserves exactly `16 + 18 * seriesCount` pixels below the chart body.
The original chart body renders at `panelHeight - reserve`, with its original
insets, domains, marks and paints. It still validates its real drawable minimum;
if that fails, the error suggests a larger panel or fewer series. Passing the
grid's 160×120 minimum alone does not guarantee enough room for the legend.
Extreme finite panel heights that lose the reserved band to numeric precision
also reject with a request to reduce the panel height.

The figure title keeps its existing 40px reservation once. Each grid panel owns
its own legend; neighboring panels retain their positions. The legend adds no
backing and its swatches/text survive transparent surface policies.

Widths use the existing approximate `estimateTextWidth(name, 11)`. The SVG declares
that advance with `textLength` and `lengthAdjust="spacingAndGlyphs"`; both the
estimate and its emitted two-decimal value must fit within `panelWidth - 36`.
This is an approximate layout with full names, not measured font layout. Glyph
outlines, bearings, combining marks, complex scripts and appearance depend on the
consumer's system font stack and SVG implementation. There is no universal glyph
containment, typography or cross-platform pixel-parity guarantee. Native raster
checks cover representative release fixtures; they are not browser playback or
all-font certification.

## Paint identity

Column rectangles use exactly the corresponding column color and opacity. Line
swatches use the actual 2px line stroke color with no extra opacity: line paths
currently do not apply the opacity used by later legacy column series. Area
series are identified by their line stroke, not a second invented area key.

Identical `(color, opacity)` pairs for columns, or identical line colors, reject
under the profile. In particular, the legacy palette repeats the first line
color at series four, so only 1–3 named legacy line series work. Choose an explicit
canonical theme for 4–8 named line series. The existing eight-color canonical
palettes pass this check; nine series always reject. Distinct encodings are not a
color-vision accessibility or contrast certification. Text uses the canonical
ink token or the existing legacy ink.

## Static legend, existing entry motion

The legend group is marked `data-plot-legend="series-names-v1"`. It has no motion
target, legacy grow/fade class or active CSS. Its subtree is identical in static,
animated, intermediate, final and reduced-motion output. Column animation uses
the reduced actual plot height, including its zero origin and label threshold.
Only emitted body marks/value labels consume the existing 2048 target budget.
The full final/reduced-motion SVG remains exactly equal to static output.

## Verification

Run the normal tests, lint, build and package checks:

```sh
node --import tsx --test --test-concurrency=1 tests/*.test.ts
npm run lint
npm run test:package
```

The focused suite is `tests/svg-series-legends.test.ts`. Its 180 explicit-legend
hash cases cover legacy plus 14 canonical themes, all three surface policies,
signed grouped/stacked columns, nullable line/area data and independent panels.
The existing 585 static motion-baseline hashes and other legacy goldens remain
unchanged. Packed consumer tests exercise both exports and declarations; the
`plot-ts/svg` runtime test has no installed runtime dependencies.

Executed runtime/native results and remaining limits are recorded in
[the release verification](verification-svg-series-legends-2026-10-05.md).
