# SVG/HTML automatic-surface policy

The pure SVG entry supports the independent `plot.surface-policy/v1` contract.
It controls explicitly registered automatic backing fills, not theme colors,
data marks or arbitrary drawings.

```ts
import { figure, parseSurfacePolicy } from 'plot-ts/svg';

const policy = parseSurfacePolicy('transparent-auto-v1');
const report = figure({ theme: 'sage-dark', surfacePolicy: policy })
  .bar({ categories: ['A', 'B'], series: [{ values: [20, 40] }] });
const svg = report.render();
const html = report.renderHtml();
```

Exact supported identifiers:

| Policy | SVG root / HTML body | HTML wrapper and emitted panel CSS |
|---|---|---|
| `themed-v1` | Existing behavior | Existing behavior |
| `transparent-root-v1` | Clear | Existing behavior |
| `transparent-auto-v1` | Clear | Clear |

Omitting `surfacePolicy` is identical to explicit `themed-v1`, including exact
SVG/HTML bytes. “Themed” retains current behavior: legacy SVG has no root backing
and stays transparent; canonical SVG has one paper rectangle. It does not add
an opaque root to legacy SVG. Unknown policy identifiers, including unversioned
names and null/non-string values, reject before other figure options are read.

`SurfacePolicy`, `SURFACE_POLICY_VERSION`, `SURFACE_POLICIES`, and
`parseSurfacePolicy` are exported from both package entries. The parser accepts
only exact identifiers; it does not interpret undefined as a default.

The option is available on `SvgFigureOptions`. Browser `FigureConfig` now also
supports the shared policy through its separate [ECharts surface adapter](browser-surface-policy.md).
The standalone SVG engine still has no native PNG export method; optional native
SVG decoding is used for testing.

## Registered surfaces and preserved semantics

- Root: canonical SVG paper rectangle and the generated HTML body background
- Panel: generated HTML `.chart-container` background and the existing emitted
  `.plt-chart` backing rule

A cleared SVG root keeps its rectangle geometry with `fill="none"`; HTML uses
`background: transparent`. Nested SVG chart panels currently have no automatic
backing fill, so root-only and automatic transparency have the same SVG result.
Their HTML results differ because the wrapper is a real panel backing.

The adapter does not replace `--paper` or any other token, add classes, activate
previously dormant selectors, change animation, or postprocess semantic shapes.
Borders, existing shadows, geometry and opacity remain. Standalone
`generateStyles()` output is unchanged.

Bars, line/area/scatter marks, heatmap cells/separators, waterfall increments,
donut slices/separators, radar fills, gauge bands/needle/hub, slope marks and
pyramid layers remain painted. Explicit gauge bands remain authored marks even
when their fill equals the theme's paper color. Transparent authored bands stay
transparent. No role is inferred from a color or shape.

This guarantee covers the registered generated sites, not caller-authored SVG,
CSS or surrounding host pages. Transparent output does not adapt colors to the
host. Pick the matching light/dark theme and inspect it against the intended
background; semantic text/marks can have less contrast on a different host.

## Verification

```sh
npm test
npm run lint
npm run test:package
npm run build
PLOT_TS_SURFACE_EVIDENCE_DIR=out/svg-surfaces \
  node --import tsx --test tests/native-svg-surface-policy.test.mjs
```

Normal tests cover every policy across default, four accents and canonical14,
require only the registered fill changes, preserve semantic paints/geometry and
animation CSS, parse stylesheet syntax and exercise hostile titles. Packed tests
run the SVG entry without installed runtime dependencies and check declarations
exclude the new option from browser Figure.

The optional native test requires the declared canvas binding with librsvg. It
renders 57 theme/policy gallery SVG/HTML/PNG cases and two authored-paper-band
cases, checks actual root alpha and surviving mark pixels, and retains separately
named light/dark host previews plus artifact/bundle/binding hashes. Previews do
not replace the alpha-bearing originals.

Browser acceptance remains unverified under the existing supported cloud-browser
`net::ERR_BLOCKED_BY_CLIENT` blocker. Structural HTML/CSS checks and native SVG
rasterization are not browser layout/interaction/animation acceptance. No browser
workaround, remote CI or scatter padding change is included here. Browser engine
policy behavior has its own explicitly bounded verification.
