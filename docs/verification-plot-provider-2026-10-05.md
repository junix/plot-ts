# Local static provider verification, 2026-10-05

The `plot-ts-svg-static/1` provider entry was checked on Linux x64 with Node
24.19.0 and 22.22.1. Each runtime passed the full native/source suite (1,108
tests), real packed-package/clean-consumer suite (16 tests), lint and full build.
After the final error-taxonomy/descriptor wording adjustment, Node24 repeated the
full 1,108 suite and Node22 repeated all 16 provider tests plus the 16 packed
consumer tests; the unchanged library suite had already passed on Node22.
The final provider-only license text was corrected to include the complete ISC
notice, then the standalone distribution and Node24 packed gate were repeated.

Three actual bundled CLI fixtures were rendered and rasterized by librsvg:
four-family independent grid with signed stacked columns, nullable line/area,
varied-radius scatter and signed CJK heatmap; the same grid with a dark canonical
theme and transparent root; and a constant heatmap. Their SVG bytes equaled direct
native library output. Native images were inspected: legends kept their full
names, signed stacks and null gaps remained visible, radii differed, heatmap
labels/escaping stayed intact, and panels stayed independent. Transparent-root
readability depends on the eventual background; fonts remain viewer-resolved.
Missing numeric axes are visible limitations, not a completed axis feature.

All existing built root/browser/SVG/declaration files matched the preceding
published legend distribution byte-for-byte. No native SVG engine source changed.
The new provider script was executed from an actual packed package's bin mapping
and as a standalone copied file in a consumer without runtime dependencies.
The bundle build rejects runtime imports outside node:fs, node:path and
node:crypto and rejects unexpected source graph edges/dynamic code.

Negative checks included decoded duplicate JSON keys, malformed UTF-8/BOM/XML
text, depth/node/array/byte/data budgets, finite overflow, ignored/unknown fields,
shape mismatches, strict CLI/pins, native geometry/name failures, input/output
aliases, symlinks/hardlinks, nonregular/FIFO input, native symlink/.. semantics,
growing/mutating inputs/stages, write-protected existing outputs, and injected
second-output failure with the old pair restored. No outputs publish on those
validation/staging failures. Tests also demonstrated that a Node preload can run
before the script rejects its environment; doctor is not runtime attestation.

An independent check against the published Hub accepted the metadata structure
but found the expected missing `visualization.plot-ts` taxonomy group. Hub
integration and end-to-end generic-core verification through Hub execution are a
separate change; this unit does not claim that integration has passed.
