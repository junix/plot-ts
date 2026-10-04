# Bounded SVG entry motion

`SvgFigure` now honors `animated` without a browser dependency or a runtime player.
This feature animates the existing column marks, column value labels and scatter
circles. Other chart families, axes, category labels, figure titles and surfaces
stay static. ECharts behavior is unchanged.

## Entry points and compatibility

| Option | `render()` | `renderHtml()` |
| --- | --- | --- |
| omitted | Exact previous static SVG bytes | Bounded entry motion, or whole-figure static fallback above the target limit |
| `false` | Static SVG | Static SVG and layout CSS, no Figure-owned animation CSS |
| `true` | Self-contained SVG with scoped inline CSS | Self-contained HTML with one valid head stylesheet |

The default HTML still has entry motion, but its motion wrappers and CSS change
intentionally. It no longer embeds the default static `render()` string verbatim.
Its mark geometry, paints, text, order, themes and surface policies remain the
same. Static SVG bytes and the public `generateStyles()` legacy stylesheet remain
unchanged. External styles authored by a host are outside this Figure-owned
motion contract; the new animated children do not use the old global
`.plt-grow` / `.plt-fade` classes.

An explicit non-boolean `animated` value throws `RangeError`. Omission and an
explicit `undefined` select the documented default.

## Plan and limits

- Growth lasts 440ms and fade lasts 300ms, using `cubic-bezier(0.22,1,0.36,1)`
- Targets receive a preferred 55ms stagger, compressed by rendered ordinal when
  necessary so every target finishes within 1600ms. Delay serialization floors
  to 0.001ms. Skipped/nonfinite inputs consume no ordinal
- At most 2048 motion wrappers are allowed across the whole figure, including
  emitted value-label wrappers. Grouped bars count individually; a nonempty
  stacked category counts once. Zero-sized circles and the existing minimum
  0.5px zero bars count because their marks are still emitted
- Explicit `animated: true` rejects excess targets with `RangeError` in SVG and
  HTML. Omitted `renderHtml()` falls back to the entire static figure. It never
  drops data, animates a prefix, or increases the static renderer's input limits
- Existing source-data/domain/panel validation still applies. This is a motion
  target limit, not a new universal source-array or SVG byte budget

Column growth uses the actual serialized zero baseline in the panel's coordinate
space. A signed stacked category grows as one group, with its positive and negative
segments kept together; value labels fade separately without movement or scaling.
Accepted explicit negative maxima can put zero outside the panel. Such marks use
fade-only entry, without changing that accepted static geometry or domain.

Scatter fades and rises inside an outer group, preserving each circle's authored
`opacity="0.7"`. Rise is at most 8px and is clamped to the actual emitted decimal
`height - cy - r`, floored to 0.01px. A mark on the bottom edge therefore fades
without moving. Static padding, domains, center positions, radii and order are
unchanged. Layout translation and motion transforms occupy separate groups.

All targets have final-state base markup. CSS uses `animation-fill-mode: both`
for the delayed initial state; there is no permanently hidden base opacity.
Versioned keyframes and playback attributes are separate from static/snapshot
attributes, and instance variables live on each wrapper. Reduced-motion CSS
disables the animation and exposes the final transform/opacity immediately.

## Deterministic frames

```ts
import { figure, type SvgFrameOptions } from 'plot-ts/svg';

const chart = figure({ animated: true, theme: 'sage-dark' })
  .bar({ categories: ['A', 'B'], series: [{ values: [8, -4] }] });

chart.render();                         // self-contained entry SVG
chart.renderHtml();                     // entry HTML
chart.renderFrame(0);                   // initial state, no CSS/player
chart.renderFrame(180);                 // deterministic intermediate SVG
chart.renderFrame(1600);                // exact static render bytes
chart.renderFrame(0, { reducedMotion: true }); // exact static render bytes
```

`renderFrame(timeMs, options?)` is a pure snapshot request using the same rendered
target plan, timing, origins and easing as CSS. It does not play or pause anything.
There is no seek state, timer, listener, event, browser plugin or lifecycle API.
Repeated calls, backward seeks and resetting to zero cannot affect later renders.

Time must be a finite non-negative number. `options.reducedMotion`, if provided,
must be boolean. Both are validated even for a static shortcut. `animated: false`
always yields static output. Otherwise an intermediate frame explicitly requests
motion even when the figure's `animated` option is omitted, and enforces the 2048
target cap. Reduced motion and times at/above 1600ms bypass only the motion budget
and return validated static output, so even dense reports retain a final frame.
For an in-budget plan, a time at/after its last target's completion also returns
the exact static string. Empty and unsupported-motion figures remain static.

## Verification boundary

`tests/svg-motion.test.ts` covers static baseline hashes, all canonical themes and
surface policies, runtime validation, exact cap boundaries, skips, signed stacks,
fractional geometry, opacity, CSS structure and stateless seek/reset behavior.
Existing HTML hash fixtures are retained; the test reverses only the intentional
motion wrapper/CSS change when comparing their old hashes.

After building, run `node --test --test-concurrency=1 tests/native-svg-motion.test.mjs`.
Set `PLOT_TS_MOTION_EVIDENCE_DIR` to retain actual stage SVGs/PNGs, pixel measurements,
hashes and runtime/native-binding identities. Native checks compare start/middle/
final/reduced frames, child alpha, unclipped references, fractional panel coverage
and translated transparent gaps. Integer raster containment is exact; static
fractional coverage keeps its previous alpha1 bound. Fractional intermediate
frames with a group-opacity composite allow at most alpha2, with a retained
paired-image witness, an opacity-flattening alpha1 control, no lost visible ink,
and a forced-unsafe-rise negative control. Exact emitted geometry never uses a
pixel tolerance. Normal, package and all previous native suites
remain required.

These deterministic native snapshots do **not** verify live browser CSS playback,
the browser's `prefers-reduced-motion` response, CSS cancellation/restart, or DOM
events. Those are a separate browser acceptance gate. No live-browser result is
claimed by this feature's native tests.
