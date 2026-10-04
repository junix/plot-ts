# Declared native canvas runtime acceptance (2026-10-04)

## Scope and disposition

Verified against plot-ts commit `0e9371f225e95b595ed5d72ea7a1f2b7309d1b6b`.
The 88 existing files were verified against the prior published source manifest
before testing. This change adds an opt-in test and documentation only; production
source, package dependencies, lockfile, and the default test command are unchanged.

- **plot-ts's supported Node API:** `plot-ts/svg`, or the root entry's `svg`
  namespace, generates SVG/HTML strings. The SVG implementation does not import
  `canvas`. Native-canvas acceptance is **not applicable to that API's operation**.
  The packed standalone SVG tests continue to run with no installed runtime
  dependencies or DOM.
- **Declared dependency acceptance:** `canvas` is a regular dependency, not an
  optional or peer dependency. Its native binding was previously unverified
  because installation used `--ignore-scripts`. The exact locked version now
  loads and passes the native checks below on both tested Node versions.
- **ECharts dependency integration:** its official Node canvas route renders and
  exports correctly in the bounded checks below. This is direct ECharts usage,
  not a new plot-ts server API.
- **Browser Figure acceptance:** still separate and unverified. `Figure` takes an
  `HTMLElement`, sets its CSS size, and registers a `window` resize listener.
  Neither a DOM shim nor a fake server-side Figure was introduced. These tests
  do not establish browser layout, events, tooltips, downloads, animation, or
  streaming behavior. No browser was launched, and no remote CI was run or added.

## Installed runtime

The lockfile supplies `canvas` **3.2.3**, `echarts` **6.1.0**, and `zrender`
**6.1.0**. The package also declares `echarts >=5.0.0` as a peer, but this check
covers only the installed, locked 6.1.0 dependency; it is not an ECharts 5 matrix.
Canvas declares Node `^18.12.0 || >=20.9.0` and N-API 7 prebuilds. Both installed
runtimes, Node **24.19.0** and **22.22.1**, report N-API 10.

The package's own `prebuild-install -r napi` command downloaded its official
[Automattic v3.2.3 Linux x64 release asset](https://github.com/Automattic/node-canvas/releases/download/v3.2.3/canvas-v3.2.3-napi-v7-linux-x64.tar.gz).
Only an isolated copy of the declared canvas package was modified. Other existing
dependencies were reused read-only. No system packages, security settings, or
browser binaries were changed, and no source compilation was needed.

- Prebuild archive SHA-256:
  `886d1cc270d4caad1d1698ee97532e79c60e992e16fe5f37f2d3bb058f4292b0`
- Native `canvas.node` SHA-256:
  `c7c6d947ab98b1e33e9618b1d00951da720bd9d69b981b34b46b9e7ca3c0aa8b`
- Reported native libraries: Cairo 1.16.0, Pango 1.48.0, FreeType 2.10.4,
  librsvg 2.52.8, JPEG 6b, GIF 5.2.1
- Platform: Linux x64/glibc. Other platforms and source-built variants were not
  tested. Checks of PNG/text and JPEG/SVG decoding do not constitute a full
  upstream canvas or codec conformance suite

The prebuild hashes identify the downloaded artifact; they are not an independent
vendor signature verification. Versions and sources are pinned by the existing
lockfile and package installer. See the
[node-canvas v3.2.3 documentation](https://github.com/Automattic/node-canvas/tree/v3.2.3)
and the [official ECharts server-side canvas guide](https://echarts.apache.org/handbook/en/how-to/cross-platform/server/).

## Reproduce the bounded native gate

Use installed declared dependencies with a functional native canvas binding, and
build the package first:

```sh
npm run build
node --test tests/native-canvas-runtime.test.mjs
```

If dependencies were deliberately installed with lifecycle scripts disabled,
`npm rebuild canvas` runs the declared package's installer. On unsupported
prebuilt platforms, follow node-canvas's documented source-build prerequisites.
The optional JPEG and SVG integration checks require a canvas build containing
JPEG and librsvg support, as the tested official prebuild does. This opt-in gate
fails when those capabilities or the native binding are missing; it does not
silently skip them. They are not requirements of the standalone plot-ts SVG API.

For retained PNG/JPEG/SVG artifacts and pixel measurements:

```sh
PLOT_TS_NATIVE_EVIDENCE_DIR=out/native-canvas \
  node --test tests/native-canvas-runtime.test.mjs
```

The test uses real `createCanvas`, 2D contexts, `loadImage`, PNG buffers/streams/
data URLs, and JPEG export. ECharts receives the native canvas directly and its
canvas factory through `setPlatformAPI`; animation is disabled. The test does
not modify browser globals or reach external services.

After `chart.resize()`, use ECharts's synchronous `getDataURL()` export before
reading a raw canvas buffer. In the tested version, resize schedules painting;
a raw `canvas.toBuffer()` immediately after resize can encode the newly cleared
surface. `getDataURL()` refreshes it. The acceptance test requires a nonempty
620×360 resized export and exact decoded-pixel agreement with the refreshed
native surface, so an empty PNG cannot pass the resize check.

## Results

Both Node **24.19.0** and **22.22.1**: **14 passed, 0 failed, 0 skipped**.

- The native binding loads without `window` or `document`
- A 360×240 PNG preserves 67,200 fully transparent, 9,600 translucent, and 9,600
  opaque pixels, including a half-alpha patch and exact opaque cyan sample
- A 480×130 text-only PNG contains 1,775 painted glyph pixels, including 1,177
  antialiased pixels. Text metrics are finite with positive ascent. This checks
  Latin text rendering, not every font, language, or missing-glyph policy
- Synchronous, callback, stream, and data-URL PNG encoders agree byte-for-byte;
  saved PNGs decode to the native source pixels exactly
- JPEG export decodes to 240×160 opaque pixels with the expected colored patch
- Invalid image bytes, a zero-width image-data read, and an invalid `drawImage`
  input reject normally; the same native context still draws and exports afterward
- Direct ECharts line, bar, scatter, area, and heatmap charts render at 800×500
  and export at 1600×1000 with a transparent corner. Title glyphs and chart data
  are present. Series-colored pixels are checked independently of axes/grid;
  all six heatmap cells are filled with distinct colors
- Updating data changes nonempty output; resize/export retains 45,159 painted
  pixels at 620×360. Disposal releases each ECharts instance
- All ten plot-ts SVG chart families render through the existing built SVG entry;
  optional native SVG decoding produces a 1600×1480 PNG with 363,601 painted
  pixels. Existing validation errors still reject malformed SVG inputs

The recorded PNG hashes and pixel measurements match exactly between both Node
versions on this machine. Transparent source exports were also inspected visually
using separate white-background previews: line, bar, scatter, area, heatmap,
Latin text, and the ten-family SVG gallery. These previews do not replace the
alpha-bearing originals. Font-dependent hashes are evidence of this run, not
portable golden values.

Existing repository gates rerun on Node 24.19.0:

- `npm test`: **822 passed**, 0 failed/skipped
- `npm run lint`: exit 0
- `npm run build`: exit 0
- `npm run test:package`: rebuild plus **8 passed**, 0 failed/skipped
- `node --import tsx examples/svg-grid-demo.ts <output-directory>`: exit 0,
  generating both the four-panel and ten-family SVG/HTML examples

The native dependency/runtime acceptance item is closed for the locked versions
and tested Linux/Node matrix. Real-browser acceptance remains open under its
previous environment blocker; native canvas is not a substitute browser pass.
