# Native numeric axes verification, 2026-10-05

Scope: native per-chart `numeric-axes-v1` on column Y and line/scatter XY,
with literal full Y/X units. This is an opt-in library change. It does not widen
machine provider-v1, add browser numeric axes, alter old tick helpers, or repair
legacy column value-label rounding.

## Source and package gates

- Based on published source commit `0d3e9136c8924a3a89341f2a4d7f3aed03a286e9`
- TypeScript lint and full Vite/declaration/provider build passed on Node 24.19.0
- Full ordinary suite: 1,141 tests passed on Node 24.19.0 and Node 22.22.1
- Existing 1,108 tests and all their legacy golden files remain unchanged
- 33 added source tests cover the profile, exact endpoints/labels, bounded
  candidate densities, actual native domains, stack endpoints, subnormals,
  units/Unicode/XML/fit rejection, fractional panels, shared marks/grids,
  independent panels, legends, themes/surfaces, render-time mutations, all
  motion modes, and the 2,048/2,049 target boundary
- Added 18 synthetic output snapshots with both observed Node 22/24 variants
  pinned alongside semantic checks
- Packed runtime/declaration/provider suites: 17 passed on each Node version
  with isolated consumers; SVG needs no DOM/canvas/runtime dependency
- Provider-v1 validator, schema, descriptor and receipt sources are unchanged;
  new native-only keys still reject. Rebuilding its executable produces a new
  digest; this is not binary identity with the previously published provider

The final byte-snapshot gate also exposed an inherited native niceness difference:
`0.00019` resolves to upper bound `0.00019999999999999998` on Node 22.22.1,
versus `0.0002` on Node 24.19.0. The exact endpoint is deliberately preserved
and labeled in full, so Node 22 uses a wider gutter. Both variants are pinned;
there is no cross-runtime byte/layout guarantee or endpoint normalization.

A fractional-height bottom-unit failure was found by adversarial tests, then
fixed by actual reserved safety padding and a safe baseline position. No fit
comparison uses an epsilon to accept clipping.

## Native raster gates and inspection

The new gate uses real `rsvg-convert 2.60.0`, Node 24.19.0 and the existing canvas
module for PNG decoding. The same complete gate also passed on Node 22.22.1:

- 135 in-memory raster cases: legacy plus 14 canonical themes × three surface
  policies × column/line/scatter
- Six retained representative final SVG/PNG pairs: synthetic project-management
  grouped columns, signed stacks, scientific scatter, fractional large-radius
  scatter, a dark CJK/null-gap/area line with names, and a 163×160 tick-thinned
  panel (162px rejects)
- Two intermediate large-radius scatter frames (0 and 150ms); guide-band pixels
  are identical to final, and reduced/final SVG equals static
- A structured expected too-small/full-unit rejection
- 114 existing native motion/legend/scatter-padding/surface tests also passed

The scientific SVG remains transparent. Its review PNG explicitly uses native
rasterizer background `#ffffff`; this is a viewing proof, not an SVG backing.
The other saved proof panels use canonical surfaces. All fixtures are synthetic;
none claims to represent a live project-management data registry.

Actual final PNGs and both motion frames were inspected at their native sizes.
Tick strings, complete units, the signed zero anchor and CJK names/units were
visible and separated; large circles remained outside guide bands. Evidence
occupies about 164 KiB including the extra Node 22 scientific proof, below the
2 MiB cap. The Node 22 400×250 proof also shows the full long endpoint without
clipping; its transparent SVG has an explicitly white-background review PNG. No browser, font download, dependency
installation or duplicated build tree was used.

`fc-match sans-serif` resolved OpenAI Sans. Fontconfig emitted unwritable-cache
warnings but rasterization succeeded. Text fitting is estimated/declared advance
box fitting, not a universal font/glyph or cross-platform pixel guarantee.
Native snapshots do not certify browser CSS playback. Existing category labels,
figure titles and old per-bar value labels retain their separate limitations.

## Reproduction

```sh
npm run lint
npm test
npm run build
node --test tests/package-exports.test.mjs tests/provider-package.test.mjs
PLOT_TS_RSVG_CONVERT=/path/to/rsvg-convert \
PLOT_TS_AXES_EVIDENCE_DIR=/small/evidence/directory \
node --test tests/native-svg-numeric-axes.test.mjs
node --import tsx --test --test-concurrency=1 \
  tests/native-svg-motion.test.mjs tests/native-svg-series-legends.test.mjs \
  tests/native-scatter-padding.test.mjs tests/native-svg-surface-policy.test.mjs
```

The evidence manifest binds PNG/SVG bytes, runtime, selected measurements and the
exact SVG bundle digest. Publication source hashes and expected parent commit
are recorded separately in the handoff manifest. Remote publication is a
separate reviewed action.
