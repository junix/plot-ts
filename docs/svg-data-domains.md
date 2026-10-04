# SVG computed numeric-data domains

Finite observations alone do not guarantee a representable chart. The pure SVG
API now throws `RangeError` during `render()` or `renderHtml()` when the computed
scale or accumulated total fails the bounded checks below. This applies to the
`plot-ts/svg` entry, the root `svg.figure()` namespace, and composed figures. A
failed render does not return partial SVG and does not mutate the input arrays.

This is an intentional behavior change for extreme finite data. It preserves
the existing arithmetic for accepted data; it does not divide observations by a
convenient scale, clamp statistical inputs, or silently substitute a different
domain. The browser/ECharts renderer and shared general-purpose scale utilities
are unchanged.

## What is rejected

| Computation | Chart families | Requirement |
| --- | --- | --- |
| Resolved domain endpoints and `max - min` | Column, line, scatter, heatmap, waterfall, slope | Endpoints and span must be finite |
| Inferred nice upper bound, including a signed lower bound's magnitude | Column, line, scatter, waterfall, radar, slope | Result must be finite, and positive when the input bound is positive |
| Accumulated partial total | Stacked column, waterfall, donut | Every partial total must be finite |
| Mapped x/y coordinate | Column, line, scatter, waterfall, slope | Result of the existing mapping must be finite |
| Inferred or supplied maximum | Gauge, pyramid | Existing finite-positive maximum checks continue unchanged |

The domain error includes the chart and axis, for example
`SVG line x domain endpoints and span must be finite`. Nice-bound errors say
`SVG radar inferred maximum must be finite and positive for positive data`.
Totals errors say `SVG donut accumulated totals must be finite`. Extrapolation
errors say `SVG mapped coordinates must be finite`. Gauge and pyramid retain
their earlier maximum error messages. If multiple requirements fail, callers
should not depend on the first error reported.

Examples of rejected inputs include:

- A line or scatter spanning x = `-1e308` to `1e308`: their difference overflows
- A mixed-sign y or heatmap color domain spanning `-1e308` to `1e308`
- Two positive stacked values, donut shares, or consecutive waterfall steps of
  `1e308`: their total overflows even though each observation is finite
- A waterfall whose intermediate total overflows and would later be reduced by
  a negative step; validation checks every step, not only the final total
- A required nice bound for `Number.MAX_VALUE`, which rounds to infinity
- A required nice bound for `Number.MIN_VALUE`, whose decimal magnitude
  calculation underflows to zero; such a positive bound is never replaced by 1
- Data extrapolated against a small explicit maximum when the existing mapping
  yields an infinite or NaN coordinate, even when that domain's span is finite

Positive and negative column stacks are checked separately. Opposite signs
cannot conceal overflow within either stack. Explicit column maxima do not
bypass the stack-total check.

## Constants, empty data and explicit maxima

True constant domains are allowed. Line/scatter constant x domains keep their
centered mapping, and constant heatmaps keep the palette midpoint, including
constant `Number.MAX_VALUE` or subnormal fields. Empty and all-zero charts retain
their existing output and fallback rules. This includes empty rectangular
heatmaps, empty/zero-total donuts, empty waterfall/slope/pyramid data and the
inferred `0..1` fallback for an all-zero radar or gauge. Existing
[panel-size requirements](svg-panel-geometry.md) still apply to empty charts.

Radar inference runs only if at least one declared axis omits its maximum.
When inference is required, the shared maximum still considers the supplied
values on all visible axes, including axes with explicit maxima. Extra values
beyond the visible axes remain excluded from inference. When every axis has a
valid explicit maximum, no unused inferred scale is checked. Existing upper
radius clipping is preserved, even when `value / maximum` overflows before
clipping; for example `value: Number.MAX_VALUE` and `max: Number.MIN_VALUE`
remain supported in radar and gauge. These are their established explicit-scale
semantics, not a new normalization rule.

Column, line and slope retain their existing explicit-maximum selection,
fallback and finite extrapolation behavior. Resolved nonfinite column/slope
domains now reject. This is not a new uniform schema for all `max` options.
Line still builds its x domain from all finite x entries and omits invalid
coordinate pairs; scatter still uses finite pairs only.

## Supported numeric envelope and limits

There is no single supported absolute-magnitude limit: acceptance depends on
the actual calculation. The tests retain byte-identical controls around
`±1e307`, small representable decimal nice bounds, subnormal raw domains and
shares, and constant or explicitly scaled `Number.MAX_VALUE` values. A raw
subnormal heatmap/color or line/scatter x domain can be representable even when
a required nice bound at the same magnitude is not. Negative-only waterfall
and slope domains can also avoid a positive nice bound.

These guards do not guarantee exact statistical precision or visible pixels for
every accepted finite input. Floating-point sums may lose tiny increments,
ratios may underflow to zero, existing clipping may apply, and the two-decimal
SVG coordinate serializer may hide small features. Array-size/resource limits,
donut hole-ratio validation, other option schemas, marker containment and
arbitrary arithmetic outside the listed checks are not covered. The checks
reject the reproduced unsafe computations rather than claiming arbitrary-finite
support or silently changing the meaning of observations.

See [the numeric-domain verification report](verification-svg-data-domains-2026-10-04.md)
for source/packed coverage, pre-change witnesses and unchanged-audit evidence.
