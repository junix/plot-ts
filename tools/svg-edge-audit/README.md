# Bounded SVG edge diagnostics

This directory retains the original **118 deterministic cases across ten SVG chart families** and **13 targeted correctness witnesses** used for the October 2026 fixes. It is a diagnostic tool, not a new global input-validation contract.

## Replay from the repository root

Use an already-installed TypeScript runner; these commands do not fetch dependencies:

```sh
node --import tsx tools/svg-edge-audit/replay.ts out/svg-edge-audit-run
node --import tsx --test tools/svg-edge-audit/regression-witnesses.test.ts
```

With an already-installed Bun:

```sh
bun tools/svg-edge-audit/replay.ts out/svg-edge-audit-bun
bun test tools/svg-edge-audit/regression-witnesses.test.ts
```

Each replay requires a **new** output directory and refuses to overwrite an old one. It writes one SVG per rendered case plus `classified-results.json`. A thrown render call produces a classified record, not a fake SVG. NaN and infinities in the JSON configuration are serialized as descriptive strings, while the actual chart receives the original numeric values from `corpus.ts`.

The replay deliberately exits **1** while any identified numeric/semantic defect or unexpected rejection remains. At the final recorded code checkpoint, this replay exits 0 because all identified diagnostics in this unchanged corpus are closed. The separate 13-test witness suite can pass while the diagnostic replay reports unresolved cases. Exit 0 means only that these bounded checks found no known defect; it is not proof of universal correctness.

The tool distinguishes:

- Ordinary finite data or a declared option that still produces wrong output
- Invalid values, invalid maxima/sizes, and policy-sensitive mismatched shapes
- Clear rejection of invalid inputs, including the gauge/pyramid RangeError contracts
- Intentional finite-pair omission in bar, line, and scatter
- Policy-sensitive cases without a defect detected by the current checks

`diagnostics.ts` contains transparent, narrow heuristics. It is not a complete SVG validator. The donut witness uses a two-half-arc path invariant; if its rendering representation changes legitimately, replace that assertion with an equivalent geometry/raster check.

Optional independent XML check (Python standard library only):

```sh
python3 tools/svg-edge-audit/check-xml.py out/svg-edge-audit-run
```

No package scripts or default test globs were changed. The recorded report/JSON under `docs/verification/` describe the exact code commit verified and distinguish supplemental offline checks from an installed-package build or CI result. Raster files are intentionally not committed; the generated SVGs can be inspected or rasterized with an already-available renderer.
