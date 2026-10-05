# Scaled machine-provider verification — 2026-10-05

## Result and contract

The additive `render-svg-scaled-v1` operation exposes unchanged native
`scaled-axes-v1` line/scatter through capability
`visualization.plot-ts.render-svg-scaled-v1`. Input and receipt are independently
versioned, closed `plot-ts.svg-scaled-figure/v1` and
`plot-ts.scaled-render-receipt/v1`. Existing V1/V2/frame schemas, validators,
receipts and complete command objects remain unchanged. This is provider
implementation evidence; publication, remote CI and actual Hub admission/pin
refresh are separate steps and were not performed in these gates.

Baseline: `28394b519575a965c61f204c9792bf9cf53134ce`. A fresh recursive GitHub tree
check found no repository AGENTS/skill instruction files. All 191 local baseline
files were independently checked against their GitHub blob identities. No
native renderer, math, dependency or toolchain source changed.

## Final runtime gates

Both Node 22.22.1 and Node 24.19.0 pass on Linux x64:

- TypeScript lint and the complete browser, SVG, declaration and provider build
- All 1,235 source tests
- All 34 existing package/build-source tests, plus six new scaled packed and
  dependency-free standalone package tests: 40 total
- All 227 native tests, including the new real provider→native SVG/node-canvas
  pixel comparison for all four scale combinations in both chart families
- All 55 locked-ECharts/native-canvas browser-surface regression cases, in
  verified bounded theme shards

All five JavaScript bundles are byte-identical across the two builds at the same
source path. Example provider SVG bytes are also identical; the full example
receipt is identical apart from truthful Node/V8/ICU/locale runtime evidence.
Runtime-specific receipt bytes are never mislabeled as cross-runtime equal.
These native-canvas/browser-harness gates are not real browser playback QA.

## New coverage

Source checks compare original supplied documents directly against the native
figure API, rather than reusing validator output as their oracle. The 180-case
scale/theme/surface matrix covers all four independent linear/log10 choices,
legacy plus every canonical theme, all three surface policies, exact explicit
domains, literal escaped units, named legends and false-only line controls.
Additional cases cover omitted scale defaults, empty axes, exact constants,
all-null Y, null gaps, repeated/decreasing X, multiple series, subnormals,
adjacent binary64 values, MIN_VALUE→MAX_VALUE positive log domains and signed
linear domains.

Packaged and standalone execution is compared against actual bundled native
SVG and the complete typed receipt bytes. Every receipt field, ordered panel,
scale choice, unit-presence flag, legend, limitation, input hash, SVG hash and
native-source identity is validated. Tampered metadata, reordered panel arrays,
missing/extra fields, wrong runtime evidence and differing raw/artifact bytes
reject. Object key reordering is harmless. The receipt does not recompute
native domains/ticks or claim measured fonts.

Boundary tests include exact 16-panel, 16,384-position and eight-series cases;
exact 65,536 combined X/Y slots with null Y counted; one-over panel/series/global
limits; explicit domain endpoint slot accounting; parser byte/depth/node limits;
duplicate/escaped-duplicate keys; unsupported profiles/families/options; malformed
or nonfinite values; invalid log coordinates; reversed/non-containing/overflow
linear domains; full-guide fitting failures; mismatched lengths; unsafe units
and invalid/duplicate legend names. A bad early logarithmic panel followed by a
late oversized panel produces the budget error before any native rendering.
Parser-node capacity can bind before the point/scalar capacities for many
scatter objects, as documented; no limit is silently relaxed.

Actual native SVG/receipt pairs are exercised through the existing publication
mechanism with changed/replaced input, changed/symlinked staging files and a
failed second rename. Prior pairs and permissions are preserved, no staging
sidecars survive, and successful writes match both actual buffers. Separate
package negatives cover stale raw pins, aliasing, destination symlinks/hardlinks,
FIFOs, invalid flags, missing pins and contaminated NODE_OPTIONS/NODE_PATH. The
existing input-symlink resolution/recheck behavior is retained. No stronger
crash-atomic or adversarial-filesystem claim is made.

## Independent review

A separate read-only reviewer ran 732 top-level checks across Node 22/24:
118 independent CLI cases plus 248 receipt/publication cases per runtime. Each
runtime includes 27 native SVG and independently assembled complete receipt
comparisons, 89 rejection invocations and 24 old V1/V2/frame SVG-plus-receipt
byte comparisons. Both new schemas and actual examples additionally validate
with Python jsonschema Draft 2020-12. No blocking defect remains.

An early draft omitted nulls from the global scalar-slot count. It was corrected
before the reviewed production build and is covered by exact-boundary and
late-budget regression tests. An initial new package test incorrectly required
one specific error code for every cross-schema request; an old validator
correctly rejected an unknown field first. Only that overly narrow test
assertion changed. Final full gates are green; no native or old-contract
relaxation was used to pass them.

## Frozen local identities and limits

- Exact native source-set SHA-256: `f15171054f6a55a7a0675599266589da9b6ddf9e1920548103a68deace3fd701`
- Frozen local executable SHA-256: `6c9a1898461dcb932817d3d2e348a740faa630e6d98ee15ec40de8de2a560fa9`
- Frozen local raw describe SHA-256: `05932e039d8847b89e3aed746766cf4c9fb2d07664d509f77eceb382831b1b9c`
- Supplied example SVG SHA-256: `ab18611b459d6a27f88b3365e1e32158b20c11e969a9f7336313d51fe0cda74e`

The executable/describe identities apply to the verified local build and its
embedded source path; a build in another path can differ. The native-source
digest describes exactly the unchanged consumed native bytes. Old execution
pins and raw-describe pins must be deliberately refreshed against the chosen
new artifact, without altering historical provenance or implicitly migrating
routes. A build identity alone is not Hub admission.

The work uses a small isolated source copy and existing dependency/runtime/font
installations. No installation, download, Rust build, cache/toolchain copy,
publication or cleanup was performed. No macOS/Windows, arbitrary-font or real
browser acceptance is claimed. Scaled-frame machine support remains future
work. See [the contract](plot-provider-scaled.md) for bounded machine limits and
unmeasured-font/fit/rounding caveats.
