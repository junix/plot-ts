# Browser figure lifecycle verification

The browser `Figure` now owns its resize listener and active stream intervals.
`dispose()` removes that listener, stops every stream, and disposes ECharts only
once. Stopping an individual stream is also idempotent. A stream started after
disposal returns an inert stop function without creating a timer.

Captured callbacks are guarded after stopping/disposal. A generator may call its
stop function or dispose its figure; that tick does not subsequently append a
point. Other figures' resize listeners and streams remain active independently.
The public method signatures are unchanged. This fix covers automatic lifecycle
callbacks, not arbitrary application calls to other methods after disposal.

## Regressions

`tests/browser-lifecycle.test.ts` covers seven cases:

1. Resize listener cleanup, stale resize callbacks, and repeated disposal
2. Disposal of multiple active streams and stale timer callbacks
3. Repeated stop calls while another stream keeps running
4. Listener, timer, and chart independence between figures
5. Starting a stream after disposal
6. Disposal from inside the generator
7. Stopping a stream from inside its own generator

The shared `tests/helpers/browser-figure.ts` harness transpiles the actual
production source with the existing TypeScript development dependency. It
supplies isolated fake ECharts, window, and timer objects, uses the real palette,
and records option snapshots. No DOM, live timer, module-loader hook, network, or
production test-injection API is needed. Run tests from the repository root:

```sh
npm test
# Alternative runtime:
bun test tests/browser-lifecycle.test.ts
```

## Recorded results

Against baseline main `3baecec3fc31009a69075e300577366970a057db`, all seven
regressions fail. Against the lifecycle candidate, all seven pass under both
Bun 1.3.14 directly and Node 24.19.0 with existing esbuild-bundled test files.

A focused TypeScript 5.9.3 strict check of the changed production code and test
files passed using a minimal offline ECharts declaration. This does not validate
the full ECharts option schema. The exact `npm test` command was attempted but
blocked by the unavailable `tsx` dependency in the offline environment. No
dependencies were installed or downloaded. Full installed-dependency build/type
checks and real ECharts/browser rendering remain unrun; these mock tests do not
establish visual or browser integration correctness.
