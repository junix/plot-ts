# Static scaled-axis machine provider

`render-svg-scaled-v1` is an additive, bounded local Node command. Its capability
ID is `visualization.plot-ts.render-svg-scaled-v1`; its closed input is
`plot-ts.svg-scaled-figure/v1` and its mandatory, path-free receipt is
`plot-ts.scaled-render-receipt/v1`. The native renderer introduced in commit
`28394b519575a965c61f204c9792bf9cf53134ce` is reused unchanged. This command adds no
renderer, logarithm implementation, provider-side coordinate conversion or
fallback. Hub installation/admission and pin refresh remain explicit steps; a
new command appearing in provider describe does not automatically refresh or
migrate an existing Hub route.

## Input and native semantics

Only line and scatter panels are admitted. Every panel must explicitly request
`axes: "scaled-axes-v1"`. Each `xScale` and `yScale` independently selects
`"linear"` or `"log10"`; omission defaults to linear. Optional `xDomain` and
`yDomain` are exact two-number endpoint arrays passed to native unchanged.
The native engine alone resolves automatic domains, validates positive log
coordinates, ordered/containing explicit domains and finite linear spans, and
chooses transform/ticks/geometry. Invalid observations or unfit guides reject
the entire figure. See [native scale semantics](svg-scaled-axes.md).

A line admits `x`, one through eight `series` of aligned nullable `y`, optional
`legend: "series-names-v1"`, full literal `unit`/`xUnit` and `yAxis: true`.
Series names are mandatory exactly when the legend is selected, distinct and
bounded as in the existing legend profile. `labels`, series `area` and series
`smooth` may be omitted or false; true rejects. `max` is unsupported: use an
exact `yDomain`. A scatter admits `points` with finite X/Y and optional radius
`size` in [0, 1024], full units, and optional `xAxis: true`/`yAxis: true`.
All objects are closed: ineffective or unknown options reject rather than
being ignored. Explicit null options are not omission.

Native semantics remain intact: all supplied line X contribute even when all Y
are null; null Y breaks a line path; no point is silently omitted. Empty axes
use native linear [0, 1] or log [1, 10] defaults. Constants retain their exact
constant domain. Repeated/decreasing X order is preserved. The positive
binary64 range is supported on log axes subject to fitting. Linear negative
zero remains native zero. No clipping, domain expansion, unit conversion or
rounded substitutes are introduced.

Figure options are the established bounded width/height/title/theme/surface
policy/columns/gap subset. Only independent panels are supported; all selected
canonical themes and surface policies reuse the original native implementation.

## Budgets before logarithmic rendering

- Raw input: at most 4 MiB, duplicate-free strict UTF-8 JSON
- JSON: depth at most 16, at most 131,072 syntax nodes
- Figure: one through 16 panels
- Panel: at most 16,384 scatter positions or summed line Y slots, including nulls
- Line: one through eight series, each exactly aligned to X
- Entire figure: at most 65,536 numeric data scalar slots, counting every X,
  every Y including null, every scatter X/Y/supplied size, and supplied domain
  endpoints; figure dimensions and other bounded presentation controls are
  separate
- SVG: at most 8 MiB; receipt: at most 256 KiB

The complete document is structurally/data-budget validated before constructing
or rendering its native figure. Thus a late over-budget panel cannot start
logarithmic rendering of an earlier panel. Native whole-render domain and fit
checks still apply. Parser-node limits can bind before numeric/position limits,
particularly for many small scatter objects. These machine limits are stricter
than the native API; native capacity does not increase provider capacity.

## Pinned execution and receipt

```sh
npm run build:provider
INPUT=examples/provider-scaled-axes-v1.json
PIN=$(node --input-type=module -e 'import fs from "node:fs"; import crypto from "node:crypto"; console.log(crypto.createHash("sha256").update(fs.readFileSync(process.argv[1])).digest("hex"))' "$INPUT")
NODE_OPTIONS= NODE_PATH= node dist/plot-provider-plot-ts.cjs render-svg-scaled-v1 "$INPUT" \
  --resource-pins "{\"input\":\"$PIN\"}" --output scaled.svg --receipt scaled-receipt.json
```

The one raw input pin is mandatory. Receipt-core v1 binds the original input
bytes and the exact SVG bytes. The typed receipt additionally binds the actual
bundled `plot-ts.native-source-set/v1` digest, not a guessed Git commit or a
self-hash of the executable. Build metadata enumerates the consumed native
source bytes, and the two-pass build verifies that set before publishing.

`figure.scaled_axes_panels` records complete ordered panel indices/types,
requested-and-validated profile, X/Y scale choices (including documented linear
defaults), and unit presence. Legends, resolved figure options, theme/surface,
static rendering, runtime evidence and ordered limitations are exact. Receipt
validation compares every field and array element against the validated request
and actual bytes. It does not infer native domains/ticks, measured fonts,
omitted labels, layout coordinates or pixel parity.

Limits remain explicit: system fonts are viewer-resolved and unmeasured, guide
fit is approximate, optional interior ticks depend on fit, and binary64 plus
SVG coordinate rounding remains. Unnamed line series retain order-based colors.
Pinning this executable does not attest Node, preloads, fonts, operating system
or the transitive environment. A trusted launcher must choose the intended Node
22/24 runtime and clear NODE_OPTIONS/NODE_PATH before startup; process readiness
cannot undo already executed preloads.

The existing publication mechanism stages and verifies both files, rechecks
source identity/bytes, rejects destination symlinks, hardlinks and aliases, and
rolls back ordinary failures including a failed second rename. This is not
crash-atomic multi-file publication or an adversarial filesystem sandbox. Input
symlinks follow the existing transport: resolve a regular file, then pin/recheck
that captured target. No new path discovery or network operation is added.

## Compatibility and deliberate refresh

The V1, V2 and frame input validators, receipt validators, six schemas and three
complete command objects remain byte-identical. They continue rejecting this
profile and scale/domain fields. Scaled frames require a separate future
contract. No V1/V2/frame input is upgraded, and the new operation never falls
back to an old operation.

Adding this command changes executable and raw-describe bytes. Preserve old
provenance and deliberately refresh both pins against the intended new artifact;
never rewrite old pins to hide a mismatch. The bundled native-source digest
remains `f15171054f6a55a7a0675599266589da9b6ddf9e1920548103a68deace3fd701` for this
unchanged native source set. A future source-byte change must produce its real
new digest and be reviewed independently.
