# SVG computed data-domain verification (2026-10-04)

Parent: `c90eb3b30b6161425816057da2c32f67db07b43d`, the published panel-geometry
checkpoint. The complete 75-file parent snapshot is verified against its Git
blob hashes and reconstructed immutable tree. This is a separate change from
panel sizes. No dependency manifest, lockfile, existing input corpus or earlier
golden fixture was changed. The existing installed declared dependencies were
reused read-only. No browser launch retry, CI run, push or package publication
was performed for this unit.

## Result and policy

The [computed-domain policy](svg-data-domains.md) rejects unrepresentable spans,
required inferred bounds, partial totals and mapped coordinates before returning
SVG. The reproduced line with x values `[-1e308, 1e308]` now throws a clear
`RangeError` instead of returning a NaN path. Guards also close overflowing
positive/negative stacks and waterfall totals, donut total overflow, missing
heatmap fill from an overflowing color span, and radar's silent `1` fallback
for an unrepresentable positive inferred bound. No scale formula or summation
order was changed.

The test fixtures explicitly distinguish a well-formed XML document from valid
numeric geometry and from a meaningful scale. For example, the old heatmap
witness parses as XML but has one cell without a `fill`; the old donut total
witness contains degenerate zero-angle slices without any NaN token. Checking
only for NaN would miss those failures.

## Final gates

Environment: Node 24.19.0, tsx 4.23.1, TypeScript 7.0.2, Vite 8.1.5,
esbuild 0.28.1 and declared ECharts 6.1.0.

- `npm test`: **822 passed**, zero failed or skipped
- `npm run lint`: exit 0
- `npm run build`: exit 0, including ESM/UMD/IIFE, SVG and declarations
- `npm run test:package`: rebuild plus **8 passed**, zero failed or skipped
- Additional strict source/test/example/audit TypeScript check: exit 0
- Focused data-domain suite: **129 passed** on candidate; **44 failed, 85 passed**
  against the unchanged parent implementation with only the new tests added
- The shared **120-case** fixture covers all ten families: **35 new rejections**,
  **4 retained gauge/pyramid rejections**, and **81 accepted outputs**
- All 81 accepted controls retain exact parent SVG bytes and exact raster pixels
- Both public source entries and both packed entries exercise the same fixture;
  the packed SVG entry runs without DOM or installed runtime dependencies
- Tests cover render-time mutation, HTML rendering, composition, input
  preservation, repeated renders, independently signed stacks and radar's
  required/unused inferred-domain distinction
- The existing **228 panel SVG hashes** pass unchanged in the complete suite
- Original **118-case audit** replay: exit 0, **89 byte- and pixel-identical SVGs**
  and **29 unchanged expected rejections**; no input fixture or policy changed
- Existing **13 portable regression witnesses** pass
- **375 generated SVG documents** independently parse as XML, including the
  116 pre-change data-case SVGs and all new accepted/audit output
- **Six exact pre-change SVG witnesses**, with baseline revision and SHA-256
  manifest, are retained under `tests/fixtures/svg-data-domain-before/`
- Sharp 0.35.4 / librsvg 2.62.91 rasterized all 81 new accepted controls and 89
  audit controls; a ten-family ordinary-output contact sheet was inspected

The source suite and packed tests use
`tests/fixtures/svg-data-domain-cases.json`. Its supported-output golden hashes
were generated from the unmodified parent source, not from the candidate. The
new fixture is independent of the preserved historical audit. The six retained
pre-change witnesses also come from the parent source and intentionally contain
invalid numeric geometry or an unrepresentable scale; they are regression
artifacts, not supported example output.

The additional strict check uses the installed declared TypeScript binary with
`--ignoreConfig --noEmit --rootDir . --target ES2022 --module NodeNext
--moduleResolution NodeNext --strict --noUncheckedIndexedAccess
--exactOptionalPropertyTypes --esModuleInterop --skipLibCheck --types node`
over source, tests, examples and portable audit files.

## Limits

This is bounded fail-closed evidence for the listed computations, not a proof
for every finite IEEE-754 value or every option combination. Accepted ratios can
underflow, sums can round away increments, and small geometry can quantize away.
Explicit radar/gauge clipping remains intentional. The browser/ECharts engine,
general-purpose scale helpers, large-array/resource policies, donut hole ratios
and unrelated option validation are unchanged. XML and raster checks do not
replace the numeric/domain tests, and no browser or CI certification is claimed.
