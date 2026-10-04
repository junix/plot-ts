# SVG panel geometry verification (2026-10-04)

Parent: `fc89bebc98b6734368d9c528b5a99708080b1bf8`, including the bounded
heatmap-label fix. All 70 parent files were checked by Git blob hash using the
published receipt and its verified immutable parent tree. Dependency manifests
and the lockfile are unchanged; the existing installed declared dependency tree
was reused read-only through a symlink. No browser, CI, repository push or npm
publication was performed for this checkpoint.

## Change and compatibility

[The panel policy](svg-panel-geometry.md) now requires finite positive panel
dimensions and actual drawable extents or radii for all ten chart families.
Existing title reservation and the 160×120 grid preflight remain unchanged.
Per-chart checks reject collapsed slope/pyramid grid regions, negative radar
radii in small single panels, and chart heights consumed by the shared title.
Empty chart configurations deliberately obey the same bounds. No-chart figures
still accept any finite positive canvas size.

The change also rejects three reproduced downstream size failures without
rescaling: an overflowing radar grid radius at `Number.MAX_VALUE` dimensions,
column recentering cancellation at width `1e20`, and nonfinite grid translations
from huge finite dimensions and gaps. Accepted neighboring extreme controls
remain byte-identical. Numeric data-domain arithmetic is unchanged.

The existing all-zero-pyramid test previously included a 160px-wide panel whose
plot was already collapsed by 200px of insets. Its supported-size control now
uses 201px, and explicit 160px/200px rejection tests preserve the intentional
contract distinction between zero data values and zero drawable area.

## Final checks

Environment: Node 24.19.0, tsx 4.23.1, TypeScript 7.0.2, Vite 8.1.5,
esbuild 0.28.1 and installed declared ECharts 6.1.0.

- Exact `npm test`: **693 passed**, zero failed/skipped
- Exact `npm run lint`: exit 0
- Exact `npm run build`: exit 0, including ESM/UMD/IIFE, SVG and declarations
- Exact `npm run test:package`: rebuild plus **7 passed**, zero failed/skipped
- Additional strict source/test/example/audit TypeScript check: exit 0
- Focused panel suite: **71 passed** on the candidate; **38 failed, 33 passed**
  against the unchanged parent implementation
- **228 pre-change SHA-256 SVG controls** remain exact: 16 option-sensitive
  configurations cover direct rendering, both public source entries, empty and
  populated data, near-boundary/default sizes, title/no-title and grids, plus
  four accepted extreme-size controls
- Exact boundary rejection and immediately adjacent representable values above
  positive bounds are tested; gauge's smallest-positive underflow is rejected
- Packed SVG entry tests run without runtime dependencies or DOM and cover all
  ten families, empties, titles, grids and the three downstream size failures;
  the packed root namespace repeats these checks with declared ECharts present
- Unchanged 118-case audit: exit 0; all **89 SVG outputs** are byte-identical and
  all **29 expected rejections** are unchanged
- All **13 portable regression witnesses** pass
- **128 size/title/grid/empty controls** and all **89 audit outputs** are
  byte-identical and pixel-identical under Sharp 0.35.4 / librsvg 2.62.91
- **314 saved SVGs** parse independently as XML, including eight pre-change
  invalid-geometry witnesses; their candidate render calls throw `RangeError`
- A ten-chart raster contact sheet was inspected for the retained ordinary
  renders. Raster files are local evidence, not package assets.

The supplemental strict check uses the declared TypeScript 7 binary with
`--ignoreConfig --noEmit --rootDir . --target ES2022 --module NodeNext
--moduleResolution NodeNext --strict --noUncheckedIndexedAccess
--exactOptionalPropertyTypes --esModuleInterop --skipLibCheck --types node`
over the source, tests, examples and portable audit files.

## Limits

Positive computed geometry can still quantize to zero under the existing
two-decimal serializer. This checkpoint does not promise visible pixels or
readable text for arbitrarily small accepted panels. It does not address
extreme data-domain overflow, arbitrary arithmetic elsewhere, other-family text
fitting, marker/stroke containment, or donut hole-ratio validation. No browser
text/interaction verification, browser launch retry or CI result is claimed.
XML parsing and successful rasterization alone are insufficient to identify
incorrect geometry; the explicit numeric and baseline assertions are essential.
