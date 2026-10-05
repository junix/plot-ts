# Numeric-axes machine-provider verification — 2026-10-05

> Historical baseline evidence. The later [decimal-bound repair](verification-svg-numeric-bounds-2026-10-05.md)
> supersedes the runtime-dependent inferred-niceness and subnormal-rejection
> observations below; it does not retroactively change this baseline's results.

This is an additive machine profile on the accepted native numeric-axes engine.
The native SVG, style and utility source files are unchanged. The executable now
has `render-svg` and `render-svg-v2` under the same provider ID. No Hub renderer,
DOM, browser, font measurement, second layout engine or domain calculation was
added. The package version remains 1.0.0; the exact script and raw describe hashes
identify this build and require explicit execution-pin refresh.

## Contract and compatibility

- New input: `plot-ts.svg-figure/v2`; new receipt: `plot-ts.render-receipt/v2`
- Receipt profile: `plot-ts-svg-static-numeric-axes/1`
- Numeric axes required on column/line/scatter; unchanged categorical heatmaps
  allowed alone or in mixed independent grids
- Exact literal unit content and omission semantics; no normalization or conversion
- V1 serialized command object, schemas, input validator and receipt maker remain
  byte-identical. Existing V1 SVG goldens and limitations remain in force
- The reused strict parser adds only an opt-in V2 diagnostic mode for fixed
  `$.charts[n].unit`/`xUnit` fields. Default V1 diagnostics remain unchanged;
  arbitrary source keys and paths are not echoed. Invalid JSON/UTF-8 stays a
  document-level error
- V2 receipts are closed-schema checked and compared against full expected
  profile/ordered-panel/unit-presence/limitation/core metadata before publication.
  They do not reconstruct native domains, counts, geometry or actual label losses

## Gates

Builds and type checks pass with Node 22.22.1 and Node 24.19.0. Both builds produce
identical provider, native SVG and root library executable bytes. Full source,
packed package, standalone copy/archive and native raster checks run on both
runtimes: 1,166 source tests, 22 packed/package tests and three small native
provider raster cases pass per runtime. Exact records are in the immutable
publication manifest. Twelve source tests apply real V1/V2 rendered pairs to
publication success, input/stage mutation and paired-rollback fault scenarios.

The numeric source gate includes 135 original-JSON/direct-native comparisons per
runtime across legacy plus all 14 canonical themes and all three surface policies.
It covers signed stacks, null/area gaps, unsorted X, empty/constant/extreme domains,
Unicode/escaped/spaced units, radii, legends and mixed heatmaps. Native domain and
fit failures are preserved as whole-render rejections. Structural and semantic
receipt tampering rejects; parser depth, node/byte/array budgets, source-position
and total-scalar limits, ineffective options and explicit schema/version
negotiation are tested. An actual native render exceeding 8 MiB is rejected before
opening either destination.

Package tests use the real npm tarball without installation. Both commands are
executed from an unrelated directory using its extracted executable and a
standalone copy. Standalone archive verification also checks the exact four-file
inventory, checksums, provenance and V1/V2 rendering on both runtimes. Import
allowlist, preload-hygiene limits, pins, aliases, FIFO/nonregular leaves, input
mutations and publication rollback are covered. V1 old/new executable replay
compares SVG and receipt bytes exactly for nine four-family theme/surface cases
on each runtime, with identical raw input and runtime evidence.

## Small native visual proof

Three supplied-JSON figures per runtime are compared byte-for-byte with direct
native output, then rasterized with the existing `rsvg-convert 2.60.0`:

1. A 400×300 synthetic project-management column chart with full tickets unit,
   planned/completed names and ordinary value labels
2. A 400×300 signed gains/losses stack with a full accounts unit and legend
3. A 900×360 scientific scatter beside an unchanged categorical heatmap, with
   complete `mol/L` and `s` units

The provider and direct-native PNGs are also byte-identical under the same
rasterizer/environment. All three Node24 PNGs and the runtime-different Node22
scientific grid were visually inspected. PM and signed-stack SVG/PNG bytes match
the accepted native evidence. Small retained input/SVG/receipt/PNG pairs avoid
duplicating the full native image corpus. Fontconfig emitted unwritable-cache
warnings; existing system fonts rendered successfully. No font was downloaded or
copied and no browser was used.

## Important retained limits

SVG text remains live and viewer-resolved, with approximate/unmeasured font fit.
Interior numeric ticks may thin; required endpoints and signed zero cannot silently
disappear. Column category/title fitting, value-label rounding/height omission,
binary64 arithmetic and two-decimal SVG coordinate serialization remain visible
limitations. Scatter sizes remain pixel radii. No whole-figure losslessness,
all-font readability, universal finite-data eligibility or cross-runtime pixel
identity is claimed.

The accepted native niceness arithmetic remains runtime-dependent. A scientific
Y endpoint may be `0.00019999999999999998` on Node22 versus `0.0002` on Node24;
full truthful text and different gutters are retained. Even eligibility can differ:
a single scatter point `(0, 0.00003)` rejects on Node22.22.1 because its inferred
upper bound is `0.000029999999999999997`, while Node24.19.0 accepts the native upper
bound `0.000030000000000000004`. The provider regression explicitly preserves this
native parity and performs no domain repair or profile fallback.

Whole-script/raw-descriptor pins do not pin Node, PATH, preloads, fonts, ICU or the
transitive environment. Trusted launch configuration remains required. Filesystem
publication is rollback-capable, not two-file crash-atomic or hostile-writer
race-free. The Hub generic receipt core checks actual bindings, not these provider
semantic or typography claims. Browser execution, Windows release testing and
new all-runtime raster certification were not performed.
