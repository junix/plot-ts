# SVG numeric axes and literal units

Column, line and scatter charts can opt in to `axes: 'numeric-axes-v1'`.
Columns gain numeric Y ticks; line and scatter gain numeric X and Y ticks.
Numbers, their positions and horizontal grids come from one native axis plan.
The existing chart renderer still owns its domains, marks, missing-value behavior,
stacking and motion. This is a pure SVG feature, without a browser or font engine.

```ts
import { figure } from 'plot-ts/svg';

const report = figure({ width: 600, height: 360, theme: 'sage' })
  .line({
    axes: 'numeric-axes-v1',
    unit: 'mV',
    xUnit: 's',
    legend: 'series-names-v1',
    x: [0, 0.1, 0.2, 0.3],
    series: [
      { name: 'Observed', y: [1.2, 2.1, null, 1.6] },
      { name: 'Predicted', y: [1.1, 1.8, 1.5, 1.7] },
    ],
  });

const svg = report.render();
const html = report.renderHtml();
const snapshot = report.renderFrame(150);
```

`NumericAxesProfile` is exported from `plot-ts/svg` and the root package's SVG
namespace. The same implementation serves direct native renderer calls,
`SvgFigure.render()`, `renderHtml()`, `renderFrame()` and independent grid panels.
This does not enable an axis option in the separate browser/ECharts API.

## Compatibility and exact option meanings

Omit `axes`, or set it to `undefined`, to retain the old output and behavior.
Existing `unit` fields remain ignored on that path, even when malformed. Old
`yAxis` still only changes native margins/gridlines, and old scatter `xAxis`
remains ineffective. No profile is inferred from a supplied unit or axis flag.

Under `numeric-axes-v1`:

- `unit` is literal Y-unit text on all three chart types
- `xUnit` is literal X-unit text on line and scatter; columns have category names
  and do not support a numeric X unit
- Each supplied unit appears once in full: Y above the chart, X below its ticks
- Omitted units add no inferred label. Explicit `undefined` is omission
- Existing `yAxis`, and scatter's existing `xAxis`, must be omitted or `true`;
  `false` conflicts with the profile and rejects
- New `xUnit` requires the profile. It is never silently ignored
- Unknown profile versions, aliases, booleans, `null` and object values reject

The profile does not convert or normalize observations. `%` does not decide
whether the data are fractions or percentage points. `USD` does not format
currency, `ms` does not convert seconds, and X units never apply to scatter
radius. Radius retains its native meaning of pixels.

Column `format` and `precision` still apply only to its existing value labels.
Axis formatting is fixed by this profile, uses actual numeric values, and does
not infer a unit from `format: 'percent'`. Supply `unit: '%'` explicitly if that
is the intended dimension. Existing rounded column value labels can still print
small values as zero; use `labels: false` for such scientific columns. Line
point labels, smoothing, category-label fitting and figure-title fitting are not
added by this profile.

Validation runs on every render of the current retained data arrays. Inputs are
not sorted, normalized or mutated. An invalid panel fails the whole call rather
than returning a partial figure or omitting its axes. The figure retains its
existing shallow-copy configuration semantics.

## Domains are the actual native domains

Axes display the same resolved domain used by the marks. They do not compute an
independent attractive range, or expand a supplied maximum to accommodate data.
Opting in makes column's axis-aware decimal ladder effective. Inferred nice
bounds use profile-local decimal candidate arithmetic: read the exponent from
`toExponential()`, parse each complete decimal ladder candidate, and select the
first finite candidate greater than or equal to the actual positive magnitude.
Negative nice bounds mirror this outward selection. No epsilon admits an inward
bound. The fine ladder is `1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10`; column upper
bounds and line lower bounds use `1, 1.2, 2, 2.4, 3.2, 4, 5, 6, 8, 10` instead.
The legacy helpers, used when the profile is omitted, remain unchanged.
Other native domain rules remain, including:

- Positive and negative column stacks accumulate independently; the scale uses
  each side's endpoints, never a net signed sum
- Column domains include zero
- Line Y includes zero. Its inferred positive maximum follows the actual data
  magnitude without a unit-sized floor; negative-only observations end at zero.
  An inferred all-zero or empty line retains the fallback `[0, 1]`. A valid
  explicit `max` is exact, including zero (`[0, 0]` for all-zero observations)
- Line X includes all finite supplied X entries, including entries paired only
  with missing Y values
- Scatter X and Y use finite coordinate pairs only, with its existing nice Y
  upper bound; negative-only scatter Y can end at zero
- A true constant domain has one centered tick with its actual value, without an
  invented min±1 range
- Empty charts retain their native resolved fallback domains. Profile-enabled
  empty columns keep a noncollapsed plot box for their numeric guides

This profile is stricter about extrapolation: every rendered value and stack
endpoint must be within the resolved domain. A supplied maximum below data or
zero, a nonfinite maximum, or a nice bound that does not contain a rendered
value rejects. There is no new clipping, silent maximum replacement or dropped
outlier. The legacy path retains its prior explicit-maximum behavior.

Existing [computed-domain checks](svg-data-domains.md) still apply. Finite inputs
do not imply representable arithmetic: overflowing spans/stack totals and a
required decimal candidate above the finite range reject. Decimal candidates
that underflow to zero are skipped; duplicate subnormal candidates are harmless.
An inferred positive bound of `Number.MIN_VALUE` can now succeed. A raw finite X
span from 0 to `1e308` does not overflow the tick calculation; a span from
`-1e308` to `1e308` still fails the domain check. Readable label fitting can impose
additional limits even when bounds and spans are representable.

The decimal-bound repair resolves the previously observed Node 22.22.1 versus
Node 24.19.0 niceness difference. Both tested runtimes infer exactly `0.0002` for
the scientific scatter example below. A singleton scatter point `(0, 0.00003)`
now has the constant Y domain `[0.00003, 0.00003]` on both, rather than rejecting
on Node 22 or acquiring a slightly expanded Y range on Node 24. A value one
representable step above a ladder candidate advances to the next candidate;
it is never rounded back down to make the label look nicer.

This changes inferred domains, mark positions, labels and fitting where the old
opt-in arithmetic differed. The marks and axes still use one actual resolved
domain, and full endpoint labels still round-trip to their values. Explicit
maxima, observations and arbitrary endpoints are not normalized. Boundary/fuzz,
SVG and native-raster checks cover the two stated runtime builds in this release;
they are not a universal cross-runtime, all-input or all-font parity guarantee.
Pin the runtime and font environment for reproducible reports.

Floating-point sums can lose tiny increments, and the native two-decimal SVG
coordinate serializer can hide tiny mark features. This is not an exact-real
arithmetic or arbitrary-finite-data guarantee. Logarithmic scales, date axes,
axis breaks, dual axes and custom bounds remain outside this profile.

## Truthful ticks and bounded density

There are at most six ticks per numeric axis, including both exact endpoints
and exact zero when the domain crosses zero. A constant domain has one tick.
The plan tries four, two and one intervals in a fixed order, with at most nine
X/Y candidate combinations. Y density has priority, then X density.

Interior candidates use overflow-resistant fraction-first arithmetic. Their
synthetic values may be cleaned to twelve significant decimal digits only when
they remain finite, inside the original domain and of the same sign. Endpoints
and observations are not rounded by this step. The cleaned tick value itself is
mapped through native `xOf`/`yOf`, so its position and printed value still agree.

Each label round-trips to its actual tick value. The native plain formatter is
used where it preserves that value; otherwise a complete decimal or scientific
notation is printed. Exponents are self-contained on each tick. No hidden common
power-of-ten multiplier, unit prefix, offset, locale conversion or false zero is
introduced. Negative zero prints as `0`.

Optional interior ticks may be reduced to make labels fit. Exact endpoints and
an interior zero cannot be silently dropped. If their full labels or serialized
positions collide, rendering rejects with a layout error. Increasing the panel
size can help ordinary crowding; extremely unbalanced signed domains may be
outside the profile's readable envelope at any practical size.

Horizontal grids use exactly the selected Y tick positions. A zero baseline is
not drawn twice as an ordinary grid and a stronger zero line. X ticks have no
vertical gridlines in this version. Guides expose a `data-plot-axes` group,
`data-plot-axis` X/Y groups with domain attributes, and `data-plot-tick-value`
records. These describe native SVG elements, not a new machine-provider schema.

## Full units, or an actionable error

A supplied unit must be a nonblank, single-line string containing at most 128
Unicode scalars and 512 UTF-8 bytes. It must be valid XML 1.0 scalar text. Illegal
controls, lone surrogates, U+FFFE/U+FFFF, tabs, CR/LF and U+2028/U+2029 reject.

Leading, trailing and repeated spaces are preserved with `xml:space="preserve"`.
XML-significant text such as `<&>` is escaped, not interpreted as markup. No
trimming, Unicode normalization, translation or unit parsing takes place.
Examples include `°C`, `µg/m³`, `kg·m²/s²`, `件/日` and `時間（秒）`.

The full unit must fit its allocated row at the fixed font size. There is no
ellipsis, hidden-title-only replacement, line wrapping, rotation, arbitrary
font-size decrease or silent omission. A sizing error asks for a larger panel,
fewer grid columns or legend rows, or explicitly shorter unit wording.

## Layout, legends and typography limits

The profile uses 10px numeric ticks, 11px units, 8px outer padding, 4px tick
marks, 6px label gaps, a 14px tick line box and a 16px unit line box. The final
plot, after insets and column recentering, must be at least 64×48 CSS pixels.
Both estimated and serialized label boxes are checked. Small safety padding
protects required gaps against coordinate rounding; it is not a tolerance that
permits clipping.

Y-label width determines its gutter. X endpoint labels can start/end at their
true tick coordinates, while interior labels are centered. This changes text
alignment without changing tick values or positions. All fits use the actual
recentered plot for a small column group.

Scatter reserves the real maximum marker radius plus separation outside its
center-domain plot. It also reserves the native maximum downward entry rise
before the X-label band. The original marker containment checks remain. A large
radius can require a larger panel once guides are enabled; there is no silent
radius reduction or domain padding.

The existing named-series legend reserves its rows first, then renders the same
axis-enabled body at the reduced height. Figure titles and panel grids retain
their existing reservations. Each panel owns its domain and axes. Passing the
grid's 160×120 preliminary minimum does not guarantee enough space for ticks,
units, radii and a legend.

Text uses the existing approximate `estimateTextWidth`, with that full estimated
advance declared as SVG `textLength`/`spacingAndGlyphs`. It is not squeezed to an
arbitrarily smaller available slot. Guide groups use the figure's system font
stack even when rendered directly.

This is full-text, approximate advance-box layout, not measured font layout.
CJK/fullwidth characters, combining sequences, complex scripts, glyph bearings,
fallback fonts and SVG implementations can differ. Successful structural checks
do not certify readable glyphs on every system or cross-platform pixel parity.
Actual native raster inspection of representative release fixtures is a separate
acceptance requirement; it does not establish browser playback or all-font
coverage.

## Themes, surfaces and motion

Tick/unit text uses canonical `--ink` (legacy ink when no theme is selected).
Grids use `--grid`; structural ticks and zero baselines use `--line`, with the
existing legacy opacities where applicable. All fourteen canonical themes and
all three surface policies share the implementation. No automatic axis backing
is added; semantic text/grid paint remains visible under transparent policies.
Contrast against an arbitrary external embedding surface is not guaranteed.

Guides and units are static. They have no entry target or grow/fade class and
consume none of the 2,048 motion-target budget. Their subtree is identical in
static, animated, HTML and frame output for the same figure state. Final and
reduced-motion output remain exactly equal to static output.

Axis reservations can change bar height and therefore whether its native value
label passes the existing emission threshold. Only actually emitted native
marks/labels count as targets. Default HTML can retain its existing dense-motion
static fallback; it never catches an axis fit error and silently removes guides.

## Product and scientific examples

```ts
// Synthetic product report: categories stay categorical; units identify Y.
figure({ width: 600, height: 360, theme: 'sage' })
  .bar({
    axes: 'numeric-axes-v1', unit: 'tickets', legend: 'series-names-v1',
    categories: ['W1', 'W2', 'W3'],
    series: [
      { name: 'Planned', values: [42, 50, 47] },
      { name: 'Completed', values: [38, 46, 49] },
    ],
  }).render();

// Small scientific values: complete tick values and both explicit dimensions.
figure({ width: 400, height: 250, theme: 'sage-dark' })
  .scatter({
    axes: 'numeric-axes-v1', xUnit: 's', unit: 'mol/L',
    points: [
      { x: 0.01, y: 0.00012 },
      { x: 0.02, y: 0.00019 },
      { x: 0.03, y: 0.00015 },
    ],
  }).render();
```

For a signed gains/losses column stack, use explicit names, `stacked: true`,
`unit: 'accounts'` and optionally `labels: false`; the two sides retain independent
scale endpoints and an exact zero reference.

## Machine-provider boundary and verification

The closed `plot-ts.svg-figure/v1` machine-provider contract is unchanged. It
still rejects `axes`, `xUnit`, `unit` and scatter `xAxis`; its receipt continues to
report unavailable numeric axis labels for the subset it accepts. A native
library feature does not silently widen that machine input or create a provider
frame command. The additive `render-svg-v2` command now accepts the separate
`plot-ts.svg-figure/v2` profile, with required numeric axes on quantitative panels
and unchanged categorical heatmaps in mixed grids. Its closed V2 receipt records
validated profile/unit presence, not computed domains or measured typography.
See the [provider contract](plot-provider.md) for exact negotiation, limits,
limitations and the required explicit execution-pin refresh.

Focused source verification:

```sh
node --import tsx --test --test-concurrency=1 tests/svg-numeric-axes.test.ts
```

Run the normal tests, lint, package checks and required native raster acceptance
before release. Source tests cover true values/positions, extreme and subnormal
math, full units, rejection, all-theme/surface semantics, legacy omission, real
legend/body composition and static guides at motion-budget boundaries. Source
and string checks alone are not a visual-readability claim.


### Small-line domain correction

The opt-in line profile no longer inherits the legacy Y maximum floor of 1.
For example, `[0.001, 0.002]` resolves to `[0, 0.002]`, and `[1e-8, 2e-8]`
produces visibly separated line coordinates instead of a flat serialized path.
Negative-only lines end at zero, including subnormal magnitudes. The existing
outward decimal bounds, zero baseline, tick fitting, missing-value behavior and
area closure remain shared by guides and marks. A valid explicit fractional or
zero maximum is used unchanged; invalid maxima still reject.

The omitted-profile legacy renderer retains its original bytes. This is an
intentional behavior correction for `numeric-axes-v1`, inherited by the static
V2 and entry-frame providers. It adds no new options or provider contracts.
See [verification](verification-svg-small-line-domains-2026-10-05.md) for the
regressions, compatibility checks and source-provenance implications.


## Separate positive logarithmic profile

Native line and scatter additionally support the explicitly separate
[`scaled-axes-v1`](svg-scaled-axes.md) profile with independent linear/log10 X/Y
scales and exact domains. Its strict observations and exact-extent rules do not
change this profile. Existing V1/V2/frame machine commands remain closed and do
not accept the new profile or its fields.
