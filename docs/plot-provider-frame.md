# One bounded native entry frame

`render-svg-frame-v1` is a separate machine-provider command and capability
`visualization.plot-ts.render-svg-frame-v1`. It returns one non-playing SVG
snapshot and one mandatory closed receipt. It calls the existing native
`SvgFigure.renderFrame`; there is no second motion engine, batch/timeline API,
HTML, animation stylesheet/player, browser or video output.

## One explicit pinned document

Use `examples/plot-provider-frame.json`, or a document such as:

```json
{
  "schema_version": "plot-ts.svg-frame/v1",
  "frame": {"profile": "entry-v1", "time_ms": 180, "reduced_motion": false},
  "figure": {"width": 640, "height": 400},
  "charts": [{"type": "scatter", "axes": "numeric-axes-v1", "points": [{"x": 0, "y": 0}, {"x": 1, "y": 2}]}]
}
```

```sh
input=examples/plot-provider-frame.json
pin=$(sha256sum "$input" | cut -d' ' -f1)
node dist/plot-provider-plot-ts.cjs render-svg-frame-v1 "$input" \
  --resource-pins "{\"input\":\"$pin\"}" \
  --output /existing/directory/frame.svg \
  --receipt /existing/directory/frame.receipt.json
```

The command has exactly four arguments: input, resource pins, output, receipt.
Time and reduced motion are in the same raw-pinned JSON as the supplied data.
There are no scalar time/reduced flags, hidden control inputs, schema sniffing or
fallback. All three frame fields are required, including explicit zero and false.
Time is any finite nonnegative binary64 number, including fractional milliseconds.
`-0` has zero's native meaning, while its original lexical bytes remain pinned.
No elapsed-time waiting or intervening-frame generation occurs.

Figure/chart fields and budgets are exactly the static V2 numeric profile:
column, line/area and scatter require `axes:"numeric-axes-v1"`; heatmaps retain
categorical fields. Full literal units, exact optional text presence and source
order are retained. Invalid/unknown/duplicate fields, nonfinite values, absent
frame fields and V2 domain/fit failures reject even final/reduced requests.
`figure.animated` and per-panel motion options are unsupported.

## Native entry-v1 semantics

Grouped columns grow each emitted mark. A nonempty signed-stack category grows
as one target; emitted height-eligible value labels fade separately. Null column
values consume no target. Zero-radius circles and emitted minimum-height zero
bars still consume targets. Scatter uses outer fade/rise wrappers, preserving
circle opacity 0.7, its fractional-radius clearance and numeric-guide clearance.

Ordinals follow rendered panel/mark/label order across the whole figure. Native
440ms growth, 300ms fade, cubic-bezier(.22,1,.36,1) and preferred 55ms stagger are
fixed. Stagger compresses for the whole figure so targets finish by 1600ms.
Lines/areas, heatmaps, numeric guides, category labels, legends, titles and
surfaces remain static. Mixed panels keep independent domains and geometry.

Non-reduced requests with time below 1600 enforce the native **2048 actual
rendered-wrapper** budget. This is not a data-source count. The entire figure
rejects with path-free `motion_target_limit` at `$.charts` if it exceeds the cap;
no marks are dropped and no static retry occurs. At time >=1600 or explicit
reduced motion, only that motion budget is bypassed. All ordinary validation,
input/output limits and publication protections still apply.

An in-budget frame at or beyond its actual native plan completion returns exact
static V2 bytes, possibly before 1600. A 2049-target intermediate request still
rejects even if its hypothetical motion would already have finished: native
planning encounters the cap before its completion check. The provider never
reconstructs target counts or completion time. No-target figures are static.

The output has no animation stylesheet/player. Native final SVG still includes
root font style and inert legacy classes/custom properties. Host-injected CSS is
uncontrolled; stripping these would break exact native/static parity. Native
raster tests do not verify live browser/CSS playback or browser reduced motion.

## Receipt and source identity

`plot-ts.frame-receipt/v1` / profile `plot-ts-svg-entry-frame-numeric-axes/1` is a
separate closed schema; V1/V2 static schemas and command objects stay unchanged.
It retains ordered V2 numeric/legend panel metadata, exact raw input and actual
SVG SHA-256/byte bindings, resolved figure/theme/surface, runtime evidence, and
all V2 limitations. Per panel, it then appends `entry-motion-family-static` for
line/heatmap and `frame-host-styling-uncontrolled` for every panel.

```json
"rendering": {
  "mode": "frame", "profile": "entry-v1", "time_ms": 180,
  "reduced_motion": false,
  "target_budget": {"limit": 2048, "policy": "enforced"}
}
```

Policies report the validated request's native budget branch:
`enforced`, `bypassed-reduced-motion`, or `bypassed-final-time`. Reduced motion
has precedence. Mode remains `frame` even when native returns static bytes.
There is no asserted target count, plan end, observed progress or active flag.
The maker bounds, schema-checks and independently compares every receipt field
before the shared pair-preserving publisher runs.

`renderer_source` contains only schema `plot-ts.native-source-set/v1` and its
SHA-256. The digest covers compact UTF-8 JSON, no newline, of sorted
`[relative_posix_path,file_sha256]` pairs for native files actually bundled from
`src/svg`, `src/style`, `src/util`. The builder captures the exact bytes loaded
by esbuild, discovers the native set in a first pass, embeds its digest in the
final pass, and rejects changed source sets/bytes or post-build disk mismatch
before publishing. The build sidecar retains the manifest; paths never enter the
receipt. Unused files are excluded; provider-only files are not native inputs.

No commit is invented and the executable never contains its own hash. The
external sidecar/Hub executable pin bind final script bytes separately. Source
identity is provenance, not Node/font/preload or transitive runtime attestation.
Trusted launchers must still clear `NODE_OPTIONS`/`NODE_PATH` before startup.

## Compatibility and bounds

Static `render-svg` and `render-svg-v2` remain explicitly negotiated, preserving
their schemas, complete command objects, validators and receipt semantics.
This addition builds upon the separately published numeric-bound correction
`deef8c2c3e0e67135d3952995b16561c2ce07878`; it changes no native arithmetic or motion.
The executable and complete raw descriptor necessarily change. Existing Hub
snapshots must reject executable or raw-describe drift, including when selecting
an unchanged static capability. Admit the new release only with deliberate
`refresh --pin-execution`; there is no default route or automatic upgrade.

The existing 4MiB input, depth16/nodes131072/array16384 JSON bounds, 1–16 charts,
16384 positions/chart, 65536 data scalars, text/series/heatmap/dimension/radius
bounds, 8MiB SVG and 256KiB receipt caps all remain. Original input mutation,
FIFO/unsafe destination, alias and stage failures preserve the old output pair.
Existing input symlinks may resolve to a pinned regular file and are rechecked;
output symlink/multiple-link leaves remain forbidden. These are ordinary POSIX
checks, not a hostile-filesystem transaction or OS sandbox promise.

See [verification](verification-provider-frame-2026-10-05.md) for the bounded
Node22/24 source, packed, standalone and native-raster release evidence.
