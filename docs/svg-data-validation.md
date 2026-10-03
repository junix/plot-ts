# SVG numeric-data boundaries

These are local fail-fast contracts for the pure SVG source API (`figure()` from
`src/svg/index.ts`). They apply when `render()` runs, including inside composed
figures. A failing chart throws a `RangeError` before `render()` can return an SVG;
it does not return a partial chart or silently replace invalid observations.

| Chart | Required data | `RangeError` message |
| --- | --- | --- |
| Heatmap | Every cell is a finite number | `Heatmap values must be finite` |
| Heatmap | Every row has the same length as the first row | `Heatmap data must be rectangular` |
| Waterfall | Every step is a finite number | `Waterfall values must be finite` |
| Waterfall | Categories and values have equal counts | `Waterfall categories and values must have equal lengths` |
| Donut | Every item's value is finite | `Donut values must be finite` |
| Radar | Every supplied series value is finite | `Radar values must be finite` |
| Slope | Both endpoints of every item are finite | `Slope endpoints must be finite` |
| Scatter | A point with finite x and y has a finite, non-negative size | `Scatter size must be finite and non-negative for finite coordinate pairs` |

“Finite” excludes `NaN`, `Infinity` and `-Infinity`. These checks do not mutate the
input arrays. If more than one requirement is violated, callers should not depend
on which violation is reported first.

## Preserved behavior

- Ordinary finite chart output is unchanged by these validation guards, including
  zero, constant and signed data. This change adds no new sign rule to donut or
  radar and does not endorse a new interpretation of signed donut sectors
- Empty valid inputs retain their previous output. `[]`, `[[]]` and `[[], []]` are
  valid empty heatmaps; `[[], [1]]` is ragged and is rejected. An empty waterfall
  requires both lists to be empty
- Radar series may have fewer values than axes; missing trailing values and sparse
  entries retain their zero fallback. Extra finite values remain ignored by visible-axis normalization and
  geometry. All supplied values, including extras, must still be finite
- Scatter still omits a point if either coordinate is nonfinite. Its omitted
  point's size is not checked. Size defaults to `4`; `0` and `-0` are allowed.
  Original animation indices are retained for rendered points
- Line retains its existing finite-pair omission and gap behavior

For example, a scatter point `{ x: NaN, y: 1, size: -1 }` is omitted, while
`{ x: 0, y: 1, size: -1 }` causes `render()` to throw. Likewise, a radar series with
`values: [1]` may still be rendered against three axes; `values: [1, NaN]` may not.

## Source validation

`tests/svg-data-validation.test.ts` exercises the exported fluent source API. It
contains explicit assertions for the twelve malformed-SVG witnesses from the
bounded 118-case audit, plus the corresponding ragged-long heatmap and extra-value
waterfall shape contracts. Further cases cover each nonfinite number alone and
among valid values, both slope endpoints, radar extras and partial/sparse values, empty
data, signed/constant/zero controls, scatter omission/default/zero sizes, line
gaps, render-time validation, composition, determinism and input preservation.

With the project's dependencies already installed, the intended commands are:

```sh
npm test
npm run lint
```

An existing Bun can also exercise these source tests without installing anything:

```sh
bun test tests/svg-data-validation.test.ts
```

The supplemental offline check used the available Node/esbuild, Bun and strict
TypeScript 5.9 tools. Against the `12d3e7d` source baseline, all twelve original
malformed-SVG regression assertions fail because no exception is thrown. With the
validation guards, all pass. The 118-case replay rejects these twelve inputs plus
the long-ragged heatmap and extra-value waterfall; prior gauge/pyramid rejections
are retained. Every still-rendered case is byte-identical to that baseline, and
Node/Bun outputs agree. The unrelated empty-heatmap-label and option repairs are
validated separately when changes are combined.

The final combined candidate on `efad666` passes 327 source tests in both Node
and Bun, plus the strict TypeScript 5.9 source/test/example check. Its 94 returned
audit SVGs all parse with no known numeric/missing-fill defect and rasterize
pixel-identically to `efad666`; the twelve original bad outputs are replaced by
clear errors. The eight example artifacts (six SVGs and two HTML files) also remain
byte-identical across the baseline/candidate and Node/Bun.

These source-level results do not certify the declared npm/tsx/TypeScript 7/Vite
workflow, installed-package exports, a browser engine, or CI. They are not a global
schema validator or a guarantee for every finite IEEE-754 magnitude. Arithmetic
overflow, scale/configuration options, dimensions and other chart families are
outside this narrow data-boundary change.
