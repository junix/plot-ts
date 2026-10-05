# Native frame-provider verification — 2026-10-05

Scope: one bounded `render-svg-frame-v1` snapshot on the separately published
numeric-bound baseline `deef8c2c3e0e67135d3952995b16561c2ce07878`. Native SVG,
style and util sources are byte-identical to that accepted baseline. No arithmetic,
motion timing, public library API, static input/receipt schema, or static canonical
command object was changed by this feature.

## Release gates

Node 22 and Node 24, Linux/POSIX, existing dependencies only:

- TypeScript `npm run lint` and complete library/types/provider build
- Complete TypeScript source suite, including native motion/numeric-axis,
  legacy golden, frame contract and real-pair fault injection suites
- Packed npm exports, original V1/V2 provider package gates, new frame packed and
  standalone gates, and two-pass source-identity adversarial build gates
- Existing native motion and numeric-axis raster suites, existing supplied V2
  numeric-provider raster witness, and a mixed supplied-document frame witness

The release evidence manifest records exact runtime versions, pass counts,
source/build hashes, raw-describe hash and each log/compact witness hash.
The final frozen source is rebuilt before these gates. `dist` contains generated
outputs and is not committed to source control; build provenance remains in the
release evidence. No dependency installation, browser, font copy or download is
part of this acceptance.

## Frame-specific coverage

- Closed required header, explicit time zero/reduced false, fractional and maximum
  finite times, decoded duplicate keys, nonfinite values, wrong types, unsupported
  versions/fields, fixed path-free diagnostics and V2 rejection reuse
- Three-command × three-document negotiation under both actual npm-packed and
  dependency-free standalone launches from an unrelated working directory
- Exact original-document direct-native parity, grouped and signed stacked
  columns with/without labels, finite/zero/fractional-radius scatter, full literal
  units/legends, mixed column/line/scatter/heatmap grids, repeated/backward seeks,
  delay boundaries, start/middle distinction, short/no-target plan completion,
  1599.999/1600/maximum finite time and reduced-motion/static equality
- Actual 2048/2049 native wrapper boundary for scatter, grouped columns, signed
  stacks, height-eligible labels and whole-figure multipanel ordering; dense
  intermediate rejection even at 1599.999, explicit reduced/final bypass only
- Native label-threshold changes after guide/legend reservation, null/zero data
  ordering and static guide/legend subtree bytes
- Full ordered V2 numeric/legend/limitation evidence, all 128 possible limitations,
  strict boolean schema handling, false/string/number/null mutations, exact
  request-derived policy and source identity, omitted/added/reordered receipt
  fields, input/output byte/hash tampering and semantically identical key order
- Input time mutation invalidates the raw pin; lexical zero and minus zero render
  identically but retain distinct original-input hashes
- Existing-pair preservation for bad headers/data/limits/pins, input FIFO,
  destination FIFO/symlink/multiple links, aliases, startup preload diagnostics,
  source byte/inode changes, altered/symlink stages and second-rename rollback
- Final/reduced requests still reject invalid geometry/data and oversized SVGs;
  original input symlinks retain the existing pinned-regular-file semantics
- Sidecar native manifest equals sorted actual esbuild native input hashes;
  unused source exclusion, consumed comment-byte changes, and injected byte
  changes between the two build passes and before on-disk verification. Both
  negative builds preserve the prior script/sidecar rather than publishing

## Compact native witness

`examples/plot-provider-frame.json` supplies all four chart families, numeric
units, signed stacks, nulls, legends and zero/fractional scatter radii. Each runtime
renders 0ms, 180ms, final 1600ms, repeated 180ms and explicit reduced motion.
Provider SVG and librsvg PNG bytes equal direct-native output at every step;
final/reduced match the matching static V2 output exactly. The retained set has
four unique input/SVG/PNG/receipt groups and a small measurement manifest, under
768KiB per runtime. Existing native tests retain their geometry and alpha controls.

## Boundaries, not claims

These tests do not execute CSS playback, HTML, a browser, browser reduced-motion
preferences or video. They do not measure live fonts or attest Node/preload/font
identity. Native final SVG retains inert styles/classes; external host styling is
uncontrolled. The receipt reports the requested frame and native budget branch,
not observed target count, progress, completion time or whether a mark moved.
MacOS/Windows and hostile-filesystem atomicity were not tested. Hub command/MCP
admission, complete-describe/executable drift and post-native receipt tampering
are separate Hub integration gates; this native report alone does not claim them.
