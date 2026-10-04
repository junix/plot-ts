# SVG scatter marker bounds

`plot-ts/svg` scatter `points[].size` is a circle **radius** in pixels, defaulting
to 4. Circles are fill-only: the renderer has no stroke or stroke-width option.
The bounds below cover static emitted circles. They do not cover later
user-authored CSS strokes, filters or transforms, or transient frames of the
existing HTML `.plt-fade` entry animation (which includes a downward translation).
Those animation classes and transforms are unchanged; browser animation
containment remains unverified. The browser Figure/ECharts renderer is unchanged.

## Marker-aware insets

The existing insets are top/right 10px, bottom 24px, and left 10px (30px with
`yAxis: true`). The renderer scans only finite x/y pairs for the maximum radius.
Each inset smaller than that radius becomes `radius + 0.01px`; sufficient legacy
insets remain exactly unchanged. The 0.01px allowance covers independent rounding
of circle centers and radii by the existing two-decimal SVG serializer.

All radii, data values, point order and original animation indices are preserved.
The inferred x/y domains, nice y maximum, constant-domain mapping, finite-pair
omission, colors, opacity and animation classes are unchanged. The drawable
coordinate range moves inward for large markers. `ScatterChart` has no explicit
min/max domain options; this change does not add or reinterpret any.

The largest radius is reserved on every side, including when that mark is an
interior point. This intentionally provides one consistent linear mapping for
all points. It does not move individual marks independently, resize radii or
change the domain to fit each marker. All ordinary radii at or below 10px retain
existing SVG/HTML bytes when their emitted markers fit the panel.

## Rejection and composition

After reserving these insets, drawable width and height must remain finite and
strictly positive, as with the existing panel contract. A radius15 scatter without
a y-axis requires width greater than 30.02px and height greater than 39.01px.
With a y-axis it requires width greater than 45.01px. Oversized inputs throw a
`RangeError` before `render()` or `renderHtml()` returns an output string.

Serialized center/radius values are checked against all four viewport edges too,
using exact decimal arithmetic. This keeps an exact edge such as
`30.01 + 10 = 40.01` without a false floating-point rejection. If an otherwise
sufficient legacy inset produces an outward-rounded center (for example radius10
at width100.006), only the overflowing sides receive the radius-plus-0.01px
allowance, once. A final containment check rejects any remaining overflow,
including huge finite sizes whose floating-point arithmetic loses an inset.
Already-contained output is never adjusted by this correction. Zero and subnormal radii retain existing
serialization, including radii that round to zero. There is no new minimum visible
marker size. Nonfinite coordinate pairs remain omitted, including their sizes;
a rendered pair still requires a finite non-negative radius.

Checks use each actual panel size after the title, columns and gaps have been
allocated. A large marker that fits a standalone figure can therefore correctly
fail in a smaller composition panel. An error does not mutate the input points.

## Verification

- Normal tests cover all four extrema, variable and fractional radii, singleton
  and constant domains, narrow canvases, invalid/oversized sizes, preserved
  source order, composition panels and 102 baseline SVG/HTML hashes
- Both installed package entry points check containment and oversized rejection
- The opt-in native test uses locked node-canvas/librsvg at 1× and 2×. It compares
  viewport rendering with an unclipped padded reference and requires zero ink
  outside the panel, including a negative control reproducing the former clip
- Native checks also exercise actual composed SVG, transparent gaps, legacy and
  canonical light/dark colors. Fractional translated viewports additionally use
  a one-alpha-level native antialiasing bound when compared with viewport-free
  references; their emitted decimal geometry is checked exactly, without an
  epsilon. Default-safe native PNGs are compared separately with the exact parent
  implementation

Run normal gates with `npm test`, `npm run lint` and `npm run test:package`.
After a build, run the native test with:

```sh
node --import tsx --test tests/native-scatter-padding.test.mjs
```

Set `PLOT_TS_SCATTER_EVIDENCE_DIR` to retain SVG, PNG, binary identity and
measurement artifacts. Browser behavior remains unverified under the existing
browser access restriction. No remote CI acceptance is claimed.
