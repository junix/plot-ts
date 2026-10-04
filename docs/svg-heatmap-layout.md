# Bounded SVG heatmap label layout

The server-side `plot-ts/svg` heatmap reserves room for data even when labels are
long. This policy covers horizontal label layout only; it does not introduce a
general minimum figure size, a data-size budget, or an extreme-number contract.

## Label policy

- Only the first `data.length` Y labels and the first row's number of X labels
  are considered. Extra labels have no cells and do not affect layout. Missing
  labels leave their rows or columns unlabeled; empty strings remain valid.
- The existing requested Y gutter, `7 × longest UTF-16 label length + 10` pixels,
  is capped at `max(10, 0.4 × (panelWidth - 10))`. The final 10 pixels are the
  right margin. For panels at least 35 pixels wide, this leaves at least 60% of
  the remaining width for data. The 10-pixel gutter floor preserves the existing
  unlabeled layout; it is not a promise about panels narrower than 20 pixels.
- Y labels have `max(0, gutter - 8)` pixels of text advance. X labels have
  `max(0, cellWidth - 8)` pixels, leaving 4 pixels on each side of the cell band.
- The existing character-class width estimator at 10px decides whether a label
  fits. It is an approximation, not font measurement. Labels estimated to fit
  retain the exact previous SVG text markup; the estimator cannot guarantee
  their physical glyph bounds in every custom font.
- Overflowing labels end in `…`. Prefixes are chosen at `Intl.Segmenter`
  grapheme boundaries, preserving surrogate pairs, combining marks, and joined
  emoji. Ellipsis advance is budgeted as 10px. A budget under 10px suppresses the
  visible label rather than drawing a clipped ellipsis.
- An abbreviated label includes its complete XML-escaped text in a nested SVG
  `<title>`. SVG viewers may expose that title as a tooltip or accessible name;
  raster exports contain only the visible prefix. Nonempty abbreviated labels
  set `textLength` and `lengthAdjust="spacingAndGlyphs"` so their specified SVG
  advance does not exceed the budget. Consumers must support those SVG features.

The policy applies in each grid panel's local coordinates. X-label margins stay
unchanged: omitted `xLabels` reserves 2px below the plot, and any supplied array,
including `[]`, reserves 24px. Short labels, cell colors, and empty rectangular
heatmaps retain their existing output when the new bounds do not apply.

## Reproduce the fixed failures

```typescript
import { figure } from 'plot-ts/svg';

const long = 'Quarterly international operations across all product categories';
const data = [[1, 2], [3, 4]];
const yLabels = figure({ width: 300, height: 200 })
  .heatmap({ data, yLabels: [long, long], xLabels: ['A', 'B'] }).render();
const xLabels = figure({ width: 300, height: 200 })
  .heatmap({ data, xLabels: [long, long], yLabels: ['A', 'B'] }).render();
```

Before this change the first example put all four cells at `x=458` with width
zero, outside the 300px panel. It now uses a 116px gutter and four visible
87×87px cells. The second example previously painted overlapping labels beyond
the panel edges; each abbreviated label now has its own column budget.

`tests/heatmap-layout.test.ts` covers these witnesses, empty and singleton data,
Unicode, escaping, surplus/missing labels, narrow bands, exact ellipsis budgets,
grids, repeated rendering, and input preservation. The packed-entry test uses
the real `plot-ts/svg` export without a DOM or installed runtime dependencies.

## Confirmed follow-ups outside this fix

These separate issues were reproduced against `57da903`. Items 1 and 2 are now
covered by the later [computed panel-geometry contract](svg-panel-geometry.md);
items 3 and 4 remain outside the heatmap label fix. A successful SVG parse or
rasterization does not make geometry correct.

1. Very small single panels: an 80×60 radar with three axes emits negative circle
   radii (`-3.33`, `-6.67`, `-10`). A 160×40 figure with a title leaves a zero-height
   chart viewport. The later panel guards now reject these configurations.
2. The existing 160×120 grid minimum is not sufficient for every renderer:
   slope uses 80px left/right insets and pyramid uses 100px left/right insets,
   formerly producing zero-width data geometry at that size. The later panel
   guards now require positive width after those exact renderer insets.
3. Extreme finite numeric domains: line data `x: [-1e308, 1e308]` and
   `y: [-1e308, 1e308]` produces `NaN` path coordinates. Heatmap data
   `[[-1e308, 1e308]]` loses the second cell's fill. Two donut values of `1e308`
   overflow their total and collapse both slices. Scale normalization and
   accumulation overflow need their own arithmetic contract.
4. Other chart families still have unbounded label text. Heatmap row crowding,
   very large arrays, figure-title fitting, and font-specific glyph overhang are
   not solved here. The later panel contract rejects zero computed data-area
   heights; tiny positive geometry still uses the existing two-decimal serializer.

Browser QA was not run for this checkpoint. The verification report distinguishes
source/package tests and Sharp/librsvg inspection from a browser result.
