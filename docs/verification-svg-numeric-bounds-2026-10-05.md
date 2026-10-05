# Native numeric-axis decimal-bound repair — 2026-10-05

This follow-on fixes the opt-in `numeric-axes-v1` renderer after the V2 machine
provider at commit `bae7463308c3567f0ebe7ef5b8a742f628b48d7f`. It changes native
inferred-bound arithmetic; it does not add provider-side domain repair, change
machine-input/receipt contracts or change the omitted-profile legacy helpers.

## Witness and resolution

The minimal V2 input is a scatter panel with `axes: "numeric-axes-v1"` and one
point `{ "x": 0, "y": 0.00003 }`. Before this fix, Node 22.22.1 inferred a Y upper
bound below the observation and the existing containment guard rejected it.
Node 24.19.0 inferred `0.000030000000000000004` and accepted it. The cause was
runtime-dependent exponentiation followed by multiplication and a tolerant
normalized step comparison.

The profile now derives the decimal exponent from the finite input's
`toExponential()` string and parses each complete allowed decimal candidate.
The first finite candidate at least as large as the actual positive magnitude
wins. Negative nice bounds mirror the same outward choice. There is no epsilon
that admits an inward candidate. The existing fine and axis ladder choices
remain chart-specific. Generic legacy `niceCeil`, `niceCeilForAxis`, `niceFloor`
and `ticks` are unchanged.

On both tested runtime builds, the singleton now has exact Y domain
`[0.00003, 0.00003]`, one actual Y tick, and a centered marker. The scientific
fixture now infers `0.0002` on both, replacing the previous Node 22 full
`0.00019999999999999998` endpoint. These are actual domain changes shared by the
marks and guides, not label rounding that disguises the old domain.

A value one representable step above an allowed bound moves to the next decimal
candidate. This can expand an opt-in domain more than the previous tolerance
allowed. Subnormal candidates that round to zero are skipped and repeated
candidates are harmless; an inferred `Number.MIN_VALUE` bound can succeed.
A required candidate above the finite range still rejects. Supplied maxima,
observations, stack arithmetic, coordinate serialization, tick planning and
full literal round-tripping labels remain unchanged.

## Executed checks

The final source passed on Node 22.22.1 and Node 24.19.0:

- Full source suite: 1,170 tests per runtime, zero failures, including the
  preserved 1,108-test pre-numeric-axis baseline and its unchanged legacy goldens
- Lint and full root/SVG/types/provider builds on both runtimes
- Same script and root/SVG JavaScript bundle bytes from both build runtimes
- Four added source tests, including 93,062 finite decimal-step, adjacent-bit and
  seeded IEEE-754 cases per runtime, checked against an independently searched
  complete finite ladder; 17 correctly rejected cases with no finite candidate
- Positive/negative columns and lines, signed stack sums, subnormal scatter and
  column bounds, extreme overflow, explicit-max containment and the repaired
  singleton, with actual domain and full tick round-trip assertions
- Packed exports and standalone provider suite: 22 tests per runtime, including
  the repaired singleton through root/SVG package exports and standalone V2
- Numeric-axis and provider native tests: 6 tests per runtime, including 135
  theme/surface/family raster cases, seven retained axis panels, two motion
  frames and three provider/direct-native supplied-JSON figures
- Existing native scatter/motion/legend/surface gates: 114 tests on Node 24
- 1,350 exact omitted-profile static, HTML and frame comparisons per runtime
  against the preceding V2 build, plus unchanged legacy source goldens
- Nine V1 supplied-JSON executions per runtime with byte-exact SVG and receipt
  replay against the preceding V2 executable

The arithmetic result digest is
`822d1ce3d667399b4ea3b2c170b3964eff9db383d8cd63c7ab68fe03c4a24df3`
on both runtime builds. The 18 retained native axis SVG/PNG artifacts and their
pixel measurements also match between those builds in this environment.

Native PNGs use librsvg 2.60.0 and existing system fonts; `fc-match sans-serif`
reports OpenAI Sans Regular. The scientific comparison PNG uses an explicit
white raster background while its SVG remains transparent. Scientific scatter,
the repaired singleton, signed stacks and dark CJK line/area panels were
visually inspected for complete visible labels, guides and mark alignment.
Fontconfig reported an unwritable cache, but rendering completed; no font
installation, browser launch or font copying was used.

## Pins and artifact scope

Final standalone script SHA-256:
`5976f6b8499ad01cdc0f31e0e7a8fa7724ebf1e33b064873f8d3088983dca653`

Final SVG bundle SHA-256:
`5919990ed03e17940d59a22d17beb3e61c09cbe4ef5cec11bc7f993edb8086a5`

Final raw describe SHA-256:
`ba952148504a580e9f83f3650dcce680598429352e9be3f049f59ebd56cc7bb1`

All provider source/validation/receipt/schema/command objects are byte-unchanged
from the preceding V2 unit. The raw descriptor differs only in its local
source-path provenance for this distinct build root. Both executable and raw
describe pins require explicit refresh; no existing execution snapshot may be
silently substituted. The package version is unchanged, so it is not an exact
artifact identity.

Builds initially wrote to an independent temporary filesystem. `npm pack`
correctly omitted a symlinked `dist`, so that packaging attempt failed before
consuming the package. The finalized build was then materialized byte-for-byte
as a regular candidate `dist` directory without changing build provenance.
Both normal package suites were rerun successfully. The verification manifest
binds the final source, regular build directory, exact baseline blobs, logs and
native evidence; prior frozen outputs remain untouched.

## Limits retained

This is bounded evidence on the stated Node versions, Linux rasterizer and
available font environment. It is not universal cross-runtime, arbitrary-input,
all-font or browser-pixel certification. Binary64 sums can still lose increments
or expose stack residuals; unbalanced domains and colliding required tick labels
can still reject. In particular this fix does not normalize the positive stack
`[0.3, 0.6]` to hide its existing reverse-subtraction residual. Explicit maxima
below data still reject under the profile. Overflowing spans/totals, unsupported
profiles and unsafe layouts retain their existing errors.
