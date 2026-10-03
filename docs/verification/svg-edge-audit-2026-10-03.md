# Bounded SVG edge-case verification — 2026-10-03

## Final code checkpoint

Repository: `junix/plot-ts`

Code commit: `6a6f50d42a869625ea224af49d1db632b30311bf`

Git tree: `e8182a007e5cc73ed6f7172d8532ec8164499f1f`

Chart source blob: `a8333164ca50a01ee2b1ae6f7d77cb2b4949b272`

The final check used a fresh GitHub commit/tree lookup and a freshly fetched
`src/svg/charts.ts`. All 40 materialized tracked source, test, example and
configuration/documentation files matched their blobs in that tree. There were
no untracked backup files in this snapshot. The original `c201ba4` baseline and
intermediate results were preserved separately.

## Results

The original **118 cases across the same ten SVG families were replayed without
adding or changing a case**. The portable corpus has identical case definitions;
only its imports and execution wrapper were adapted for repository use.

| Check | Result |
| --- | --- |
| Original corpus outcomes | 94 rendered SVGs + 24 intentional `RangeError` rejections |
| Original Node/Bun parity | All 118 outcomes and 94 SVG byte strings identical |
| Portable/original parity | All case configurations, order, outcomes and SVG bytes identical |
| XML documents parsed | 94; rejected inputs do not count as parsed SVGs |
| Nonfinite geometry, negative numeric sizes, missing heatmap fill | 0 flagged cases |
| Existing finite semantic witnesses | 0 flagged cases |
| Portable diagnostic exit | 0 in both bundled Node and direct Bun |
| Original 13 correctness witnesses | 13/13 pass |
| Portable 13 correctness witnesses | 13/13 pass in Node and Bun |
| Existing repository source suite | 351/351 pass in Node and Bun, across 20 files |
| Strict focused TypeScript | Source/tests/example and portable tools pass |
| Sharp rasterization | All 94 returned SVGs rasterize successfully |
| Independent Inkscape samples | Singleton donut, paired-domain bar, heatmap labels and full-span gauge band render successfully |

The final classified cases and exact serialized configurations are retained in
[the JSON record](svg-edge-audit-2026-10-03.json). To regenerate the SVGs and
classified results, see [the portable replay instructions](../../tools/svg-edge-audit/README.md).

## What the original witnesses establish

- A singleton or constant-x scatter uses finite centered x coordinates
- Constant heatmaps have an explicit palette fill; an empty Y-label array no
  longer invalidates the margin calculation
- A single nonzero donut part draws a visible full ring, including zero-valued
  neighboring parts
- Waterfall domains include cumulative peaks and troughs rather than only steps
  and the final total
- Radar series share an inferred global maximum across supplied series and
  declared axes; explicit valid axis maxima retain their override behavior
- Negative and mixed-sign stacks use correct cumulative extents and remain on
  the proper side of zero
- Zero-valued gauge, radar and pyramid inputs produce finite geometry
- Heatmap X labels and the declared `blues`/`plasma` options are honored
- A full-span gauge band uses the correct large-arc geometry
- A grouped bar's unpaired trailing negative value no longer changes the domain
  of the visible categories

The singleton donut has 123,494 non-white pixels in the independent Inkscape
sample and a white center hole. The paired-domain bar's former 4.5-pixel visible
bar now spans its intended 454 pixels. A contact sheet of final corpus outputs
was visually inspected; raster bulk is not committed because the replay
regenerates its source SVGs.

## Rejections and preserved flexibility

The 24 exceptions are **intended rejected inputs, not 24 render failures**:

| Family | Rejected corpus cases | Reason |
| --- | --- | --- |
| Gauge | 6 | Nonfinite value or nonpositive/nonfinite explicit or inferred maximum |
| Pyramid | 4 | Negative or nonfinite values |
| Heatmap | 4 | Nonfinite cells or ragged rows |
| Waterfall | 4 | Nonfinite steps or unequal category/value counts |
| Donut | 1 | Nonfinite values |
| Radar | 1 | Nonfinite values |
| Slope | 2 | Nonfinite endpoints |
| Scatter | 2 | Negative/nonfinite marker size on a rendered finite coordinate pair |

See [the local data-boundary contracts](../svg-data-validation.md). The diagnostic
classifier separately records six cases using intentional finite-pair omission
in bar/line/scatter and three cases using documented radar partial/extra-value
handling. Missing radar values retain their zero fallback; extra finite radar
values do not affect visible-axis normalization.

Eight finite sign/configuration or bar-length probes remain labeled
`policy_sensitive_no_defect_detected`, rather than being promoted to a universal
valid-input contract. They cover short/long bar arrays, signed donut/radar data,
a negative donut hole ratio and an explicit zero radar maximum. The existing
behavior produced no defect detected by this bounded replay. This verification
does not invent broader sign or configuration semantics for those inputs.

The remaining 77 cases are labeled `no_issue_detected`. These classifications
sum to 118: 77 ordinary observations + 8 policy-sensitive observations + 24
intended rejections + 6 intentional omissions + 3 documented radar fallbacks.

## Baseline and diagnostic honesty

At the original `c201ba4e6927f6dd8e00699f78ecbf26b5a46ad8` baseline, all 118 calls
returned, 37 had numeric/missing-fill defects, and 11 of the 13 correctness
witnesses failed. Intermediate `12d3e7d` results retained 13 numeric/fill cases;
`11e0e607` closed those but retained one paired-bar semantic counterexample.
The portable replay returned exit 1 for that remaining counterexample. The final
`6a6f50d` run returns exit 0 only after that same unchanged witness is closed.

No expected failure was suppressed to manufacture a green result. The replay
will exit 1 again if it detects a numeric/semantic defect, an unexpected
rejection, or a missing required rejection. XML parsing is independently
available, but parsing alone is not treated as proof of chart correctness.

## Tools and limits

Supplemental offline tools: Node 24.19.0, Bun 1.3.14, TypeScript 5.9.3,
esbuild 0.27.7, Sharp 0.35.4 and Inkscape 1.4. Fontconfig/Inkscape emitted
read-only profile/cache warnings but still produced the requested raster files;
no access workaround was used.

These source-level checks do **not** certify the declared npm/tsx/TypeScript 7/Vite
workflow, installed-package exports, browser interaction, CI, every finite
IEEE-754 magnitude, or every untested option. The replay is intentionally bounded
to the original ten SVG families and 118 cases. No default npm test script or
production source file is changed by this evidence package.
