# Small numeric line domains — 2026-10-05

Baseline: `junix/plot-ts` main at
`2afcfec169ccc624d3f98b43b3dda8b9099d36ce`, verified through GitHub before work.
This narrow correction changes only the native opt-in line Y-domain resolution;
no new chart type, API option, provider command or schema is introduced.

## Witness and corrected behavior

A line with `axes: 'numeric-axes-v1'`, X `[0, 1]`, and Y `[0.001, 0.002]`
previously resolved to `[0, 1]`. With Y `[1e-8, 2e-8]`, both observations could
serialize to the same Y coordinate. The old source test explicitly asserted
this unit-sized floor. Labels were numerically accurate for the bad domain, but
that domain hid the actual variation.

The correction removes `Math.max(upper, 1)` only for numeric-profile lines:

- Positive inferred maxima follow the existing outward decimal ladder at the
  data's magnitude: the two examples now use `[0, 0.002]` and `[0, 2e-8]`
- Negative-only observations end at zero, including subnormal observations;
  `[-0.002, -0.001]` uses `[-0.002, 0]`
- Inferred empty, all-null and all-zero inputs preserve the fallback `[0, 1]`
- Valid explicit maxima remain exact, including fractions and zero. All-zero
  data with explicit `max: 0` uses the constant domain `[0, 0]`
- Invalid/nonfinite maxima, overflowing spans, impossible outward bounds and
  unreadable exact endpoint/zero layouts still reject

One resolved domain drives marks, areas, zero baseline, ticks and grids. The
existing zero-inclusive line policy, missing-value gaps, singleton treatment,
area closure and two-decimal SVG serialization are unchanged. No logarithm,
exponentiation, tolerance, provider-side rescaling or independent axis domain
was added. Legacy omitted-profile arithmetic remains identical.

## Verification

Node 22.22.1 and Node 24.19.0 each passed:

- Type checking and complete root/SVG/types/provider builds
- All 1,197 source tests: the 1,185-test baseline plus 12 new small-line tests
- All 32 packed export/provider/build-source tests, including actual packed and
  dependency-free standalone V2/frame executions of small, negative, subnormal,
  explicitly bounded and constant-zero lines
- Eight numeric-axis/provider/frame native-raster tests, including 135
  theme/surface/family cases, four new small-line panels with actual dark pixels
  sampled along their rescaled paths, static/frame parity and seek checks

The root ESM/IIFE/UMD, SVG and standalone provider JavaScript builds matched
byte-for-byte between these two runtime builds at the same source path. All 26
retained numeric-axis SVG/PNG artifacts and their measurements matched, as did
three V2 and four frame-provider sample SVG/PNG identities. Receipts separately
record the actual runtime version. Native rasterization used librsvg 2.60.0 and
existing system fonts; no browser, font download or remote CI was used.

The legacy canonical/scatter/motion/legend/surface native matrix passed 200 tests
and the native canvas suite passed 14 tests on both runtimes. Existing source
goldens and all six golden files are unchanged. New tests assert actual domains,
geometry and pixels; no snapshot was regenerated to conceal a mismatch.

An independent review passed, on each runtime:

- 38 focused edge-case groups and exact-decimal rescaling checks
- 420 omitted-profile static/HTML/frame comparisons and 20 unaffected numeric,
  column or scatter comparisons
- 70 V2/frame renders matching both source and built native SVG; 11 V1 legacy
  output comparisons; 12 rejection cases preserving old SVG/receipt pairs
- Five signed/subnormal native raster witnesses and 40 actual line-pixel samples

The unchanged native browser-surface suite also passed all 55 tests on Node 24
when run in fresh per-theme processes plus its seven remaining checks. An
unpartitioned run was terminated with `SIGKILL` before assertion diagnostics;
partitioning covered the complete existing suite without changing its code or
expectations. This extra native ECharts check is not live-browser verification.

The review independently reproduced the baseline's collapsed tiny line and
confirmed domain/tick/mark agreement after the change. White-background native
raster views were also inspected for positive, negative and subnormal examples.
The SVG remains transparent where the established surface policy requests it.

## Provider identity and historical pins

Only consumed native input `src/svg/charts.ts` changes. Its SHA-256 is
`8fd4b868522c22a3e3c37cbf9480e7fa88ae06770ffab58f807e4629eccdea18`.
The updated native source-set SHA-256 is
`8eba98b807d44643de2d1f30631745964ffc74ec45254e4200815ac34aec8915`.
The build sidecar and every frame receipt bind this current source set. The
source-byte build tests independently recompute it and reject source drift.

All three complete command objects and all six machine schemas are unchanged.
V1 rendering preserves its legacy output. V2 and frame rendering inherit the
corrected native numeric-profile line behavior. Script bytes change, and the
raw descriptor can also change when its build-source path changes. Existing
execution/describe pins must deliberately refresh; no stale pin is accepted.

The command fixture's `native_commit` and `native_arithmetic_baseline` remain
historical introduction baselines, now explicitly identified as such. They do
not claim the current engine still has those bytes. Earlier verification
reports are historical and have not been rewritten. A new commit identity is
not invented inside this build.

## Limits and reproduction

This removes the unit-sized floor; it does not promise scale-invariant results
for arbitrary binary64 arithmetic. For example, `3 * 1e100` is greater than the
literal `3e100` in binary64 and can legitimately advance to the next outward
bound. Extremely unbalanced signed data can still fail exact-label fitting;
large-offset line data still follows the documented zero-inclusive policy.
Native pixels do not establish live browser/CSS playback, browser reduced-motion
behavior, arbitrary font parity or other operating-system behavior.

Run `npm run lint`, `npm test`, and `npm run test:package`. After building, run
`node --test tests/native-svg-numeric-axes.test.mjs tests/native-provider-numeric-axes.test.mjs tests/native-provider-frame.test.mjs`.
Supply an installed `rsvg-convert` through PATH or `PLOT_TS_RSVG_CONVERT`, and a
writable font cache if required. Native tests importing TypeScript helpers need
`--import tsx`. Optional evidence directories retain bounded artifacts rather
than a duplicated full image corpus. All work uses existing local dependencies.
