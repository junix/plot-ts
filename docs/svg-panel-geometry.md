# SVG panel geometry contract

`plot-ts/svg` rejects unsupported panel geometry with a chart-specific
`RangeError` before returning an SVG or HTML string. It validates the actual
computed dimensions, rather than resizing charts or imposing one new minimum
on every chart family. Existing supported output keeps its exact SVG bytes.

## Canvas, title and grid

Canvas width and height must be finite positive numbers. A figure with no
charts retains its existing empty output at any such size, even if it has a
title. After a chart is added, a truthy figure title reserves 40 pixels before
chart validation; an empty title reserves none.

Multi-chart figures retain their existing minimum of 160×120 pixels per panel.
This is a grid preflight, not sufficient space for every renderer. Each panel
also passes the chart-specific checks below. For example, a 320×120 figure with
two columns and no gap can render two bars, but cannot render a slope or pyramid:
its 160px-wide panels leave those charts no drawable width. A shared figure
title and grid gaps are deducted before the panels are checked.

## Actual drawable bounds

The following dimensions describe the panel after title and grid layout. All
inequalities are strict: equality would leave a zero-sized drawable region.

| Chart | Panel width | Panel height |
| --- | --- | --- |
| Column (`bar`) | >10px; >38px with `yAxis: true` | >46px; >32px with `labels: false` |
| Line | >10px; >38px with `yAxis: true` | >46px |
| Scatter | >20px; >40px with `yAxis: true` | >34px |
| Heatmap | >20px, using the actual bounded label gutter | >4px; >26px when `xLabels` is supplied, including `[]` |
| Waterfall | >60px | >60px |
| Donut | >40px | >40px |
| Radar | >80px | >80px |
| Gauge | >0px, with a positive computed radius | >0px, with a positive computed radius |
| Slope | >160px | >60px |
| Pyramid | >200px | >20px |

Rectangular charts check the finite positive width and height returned from
layout using their actual insets. Donut and radar check their existing outer
radii, `min(width, height) / 2 - 20` and `min(width, height) / 2 - 40`. Gauge checks
its existing `min(width, height) * 0.4` radius, including floating-point underflow.
These checks also apply to direct source renderer calls and both public entry
points: `plot-ts/svg` and the `svg` namespace exported by `plot-ts`.

Empty configurations obey the same chart bounds. This is an intentional error
contract change: empty heatmaps and zero-total donuts no longer bypass bounds
via an early blank return. Empty columns, lines, scatter plots, waterfalls,
radars, slopes and pyramids also require their chart's drawable bounds. Gauge
has no empty dataset; a zero value or an empty `bands` array does not bypass its
radius validation. Their supported-size empty output is unchanged.

## Computed size arithmetic

Finite input dimensions alone do not ensure usable computed layout. Three
existing finite-size failures are rejected without changing valid geometry:

- Column recentering can cancel a positive data width to zero at huge sizes,
  such as width `1e20` with one category. Nonempty categories require a positive
  finite recentered width; the existing empty-category layout is preserved.
- A `Number.MAX_VALUE` square radar overflows its third grid radius. Every
  computed grid radius must remain finite and positive.
- Huge finite grid dimensions and gaps can overflow intermediate positions.
  All computed panel translations must be finite, including a zero row or
  column index multiplied by an infinite stride.

The first two errors identify the chart; grid position failures identify the
layout. Small-panel errors describe the required margins or radius. Reduce huge
sizes when a recentering, radius-overflow or grid-position error occurs.

## What this does not promise

This is a computed-layout check, not a guarantee of visible pixels, readable
labels or full content containment at every accepted size. The existing
serializer rounds most coordinates to two decimals. Positive extents just
above a boundary can still serialize to zero or coincident coordinates; their
bytes are deliberately unchanged. No rounding-based minimum is added.

Label text, fixed-size markers and strokes may need more room than these bounds.
Heatmap cell count, other charts' text fitting, title fitting, extreme numeric
data domains, arbitrary arithmetic overflow elsewhere, and donut `holeRatio`
validation remain separate concerns. The checks do not rescale geometry, clamp
panel dimensions, change data domains or add runtime dependencies.

## Regression coverage

`tests/svg-panel-geometry.test.ts` covers all ten chart families and 16
option-sensitive configurations: exact and just-above boundaries, invalid direct
dimensions, empty data, title reservation, grids, both source public entries,
repeat rendering, and the three finite-size failures. A checked-in set of 228
SHA-256 hashes captured from the prior implementation protects byte-for-byte
near-boundary, ordinary, titled, empty and grid output. The packed-export suite
also exercises all families through the installed SVG entry and root namespace.

The separate verification report records baseline failures, the unchanged
118-case diagnostic corpus, independent XML parsing, and Sharp/librsvg pixel
comparisons. Browser and CI validation are not claimed.
