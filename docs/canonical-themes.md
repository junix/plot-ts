# Opt-in canonical themes

plot-ts now consumes the same pinned `diagram-theme/v1` colors as the other plot
engines. The source is
[`junix/diagram-theme-rs@1cc4e6667aa86444a7e9055549aa85cac293dc07`](https://github.com/junix/diagram-theme-rs/blob/1cc4e6667aa86444a7e9055549aa85cac293dc07/registry/theme.json).
It is vendored unchanged in `assets/canonical/theme.json`; `source.json` records
the full commit, Git blob SHA-1, and SHA-256. No network or Rust runtime is needed.

## Select a theme

The seven families are `azure`, `mist-blue`, `sage`, `stone-teal`, `dusty-violet`,
`warm-sand`, and `olive-paper`. Each unsuffixed name selects light mode; append
`-dark` for dark mode. Names and case are exact. There is no automatic mode switch.

```ts
import { figure, CANONICAL_THEME_NAMES, getCanonicalTheme } from 'plot-ts/svg';

const report = figure({ theme: 'sage-dark', width: 800, height: 500, title: 'Revenue' })
  .bar({ categories: ['Q1', 'Q2'], series: [{ values: [120, 150] }] });
const svg = report.render();
const html = report.renderHtml();
console.log(CANONICAL_THEME_NAMES); // seven families, each light then dark
console.log(getCanonicalTheme('sage-dark').tokens['--ink']);
```

```ts
import { Figure } from 'plot-ts';

const chart = new Figure(document.getElementById('chart')!, { theme: 'sage-dark' })
  .plot([0, 1, 2], [3, 7, 5])
  .scatter([0, 1, 2], [5, 4, 8], { color: '#123456' }); // explicit color wins
chart.render();
const pngDataUrl = chart.exportImage('png');
```

`CANONICAL_THEME_NAMES`, `getCanonicalTheme`, and the `CanonicalThemeName`,
`CanonicalTheme`, and `CanonicalTokenName` types are exported from both entries.
Lookup objects, tokens, names and series arrays are frozen. The lookup exposes
all 24 exact upstream token names and colors; categorical series use `--s1`
through `--s8` in that order, repeating after eight. No hue sorting or generated
substitute palette is used.

## Consuming paths and precedence

- SVG: all ten supported chart families consume canonical colors. Categorical
  marks use the ordered series; titles/labels use ink/muted; grids and baselines
  use grid/line. Waterfall gain/loss and default gauge bands use pos/warn/neg.
  Donut labels choose black or white against their mark. Stacked-column labels
  keep their existing above-segment position and choose contrast from the
  rendered surface under the label center (paper or a preceding segment). Mark
  colors are unchanged. Existing opacity/geometry rules remain unchanged
- SVG figure: one paper rectangle provides the selected canvas surface, including
  an empty figure. Nested chart panels do not create additional paper rectangles
- SVG HTML: the page and chart wrapper use canonical paper; the existing style
  adapter gets canonical ink/accent/paper/grid. Theme colors take precedence over
  the legacy `accent` option when a canonical theme is supplied
- Figure: the selected canonical object is passed directly to ECharts at init,
  without registering a global theme. It supplies paper, text/title/legend,
  axis/grid, tooltip and panel colors. The existing line/scatter/bar/area and
  custom violin data builders consume the ordered categorical colors
- Figure PNG/JPEG exports: the existing export method uses canonical paper instead
  of its legacy white matte. JPEG remains an opaque format. Direct use of the
  raw ECharts instance remains available with its own export options
- Explicit Figure mark colors, including `transparent`, still win. Heatmap
  colormaps keep their numerical meaning and are unchanged, including the
  default viridis palette. SVG gauge bands remain exactly caller-supplied when
  present, including empty or transparent bands. Data, domains and geometry do
  not change with the theme

This is an additive color integration, not a new general-purpose theme contract.
The adapter does not recolor numerical heatmaps to categorical series, make
semantic fills transparent, introduce font settings, or change animation.
The canonical source's additional diagram-specific tokens remain available for
inspection; not every token has a corresponding plot primitive.

## Compatibility

Omitting the theme retains legacy SVG bytes, Figure options, stylesheet rules and
white export matte. A separate HTML-only repair removes the inherited nested
`<style>` wrapper from legacy `renderHtml()` output; every branch now emits one
valid stylesheet. Canonical HTML bytes are unchanged by that repair. See the
[HTML stylesheet verification](verification-html-styles-2026-10-04.md). The six existing `THEMES` entries and `setTheme`/`withTheme` behavior
are unchanged and separate from canonical selection. Calling `setTheme('sage')`
still rejects: select canonical colors explicitly on each figure instead.

The browser `FigureConfig.theme` remains a string: recognized canonical names
opt in, and other strings are forwarded unchanged as ECharts theme names. The
SVG option only accepts canonical names and rejects unknown names at runtime.
`getCanonicalTheme` also rejects unknown names. No existing global setting is
changed by selecting a canonical theme.

## Regeneration and checks

```sh
python3 tools/gen-canonical-themes.py --check
npm test
npm run lint
npm run test:package
```

Regenerate offline with `python3 tools/gen-canonical-themes.py`. The generator
checks the pin, both registry hashes, schema, exact token/family order and values.
The default tests compare all 14 variants with the vendored upstream registry,
exercise every consuming path, and compare theme-independent data and geometry.
The packed SVG entry is checked in a consumer without runtime dependencies.

Native rendering is an additional opt-in gate requiring the declared `canvas`
dependency to have a working binding and librsvg support:

```sh
npm run build
PLOT_TS_CANONICAL_EVIDENCE_DIR=out/canonical \
  node --import tsx --test tests/native-canonical-themes.test.mjs
python3 tools/check-canonical-html.py out/canonical/*-svg-gallery.html
```

This renders all 14 ten-family SVG galleries and Figure-generated line, bar,
scatter, area and heatmap options through real native ECharts, checks decoded PNG
pixels, and retains HTML/SVG/PNG/2× exports plus source/bundle/binding hashes. The
Python-stdlib HTML gate parses nesting and checks stylesheet variables and their
surface rules; this is structural validation, not browser acceptance. Custom
violin data colors are covered at option generation only; this gate does not
expand or certify the existing custom violin renderer.

**Browser acceptance remains unverified.** Option-harness tests validate the
actual Figure builder, and native ECharts tests validate server rendering of
those outputs. Neither proves browser layout, interaction, tooltips, downloads,
resize events or animation. The supported cloud-browser localhost attempt was
blocked with `net::ERR_BLOCKED_BY_CLIENT`; no alternate browser transport or
remote CI was used. The native gate is not a browser pass.
