# Browser streaming series selection and retention

`appendPoint(x, y, seriesIndex = 0, maxPoints = 50)` selects a Figure series by
its zero-based creation order. `stream(generator, interval, maxPoints,
seriesIndex)` delegates each generated point to that same selection. Render the
Figure after adding series and before streaming updates.

```ts
const fig = figure(container)
fig.plot([0], [10], { name: 'reference' })
   .scatter([0], [20], { name: 'live' })
   .render()

fig.appendPoint(1, 21, 1) // updates the scatter series only
const stop = fig.stream(() => ({ x: nextX(), y: nextY() }), 500, 50, 1)
// Call stop() when this stream is no longer needed.
```

## Identity and raw ECharts access

Figure assigns each series an internally owned ECharts `id` when the series is
created. That ID survives `render()` and `update()`. Incremental updates send
only the selected ID and its data, so duplicate display names and preceding
unnamed series cannot redirect an append to the first series. All six builders
(`plot`, `scatter`, `bar`, `heatmap`, `violin`, `area`) receive IDs; this does not
add support for streaming XY points into non-XY chart data formats.

The IDs are implementation details, not public names or a user configuration
API. When using `getRawChart()` or `getECharts()`, leave Figure-owned IDs intact
and do not reuse them for unrelated series. Removing/replacing Figure-owned
series, clearing the raw chart, or directly rewriting its data is not
synchronized back into Figure and is outside this streaming contract.

This matches ECharts' normal merge behavior: explicit IDs are matched before
name and positional fallbacks. See the upstream
[mapping implementation](https://github.com/apache/echarts/blob/6.0.0/src/util/model.ts#L238-L250).

## Bounded history

`maxPoints` defaults to 50 and must be a positive safe integer (1 through
`Number.MAX_SAFE_INTEGER`). Zero, negatives, fractions, non-finite values,
unsafe integers, and non-number values throw `RangeError`.

For an existing series, `appendPoint` validates before changing any data or
calling ECharts. Each successful append retains the newest `maxPoints` points
in insertion order, including the new point. An initially oversized series is
reduced to that bound in one trim on its first append. Changing the bound on a
later append is supported; increasing it does not restore discarded points.
Other series and all Figure-owned IDs stay unchanged.

`stream` validates synchronously before starting its timer or invoking the
generator, even if its selected series does not exist yet. With a valid bound,
each tick uses the same retention rules as `appendPoint`; creating the stream
does not trim existing data until its first append. A stream with a currently
missing target can start updating it after that series is added. Calling
`stream` on a disposed Figure remains a no-op, including for an invalid bound.

## Existing behavior retained

- A missing series index in `appendPoint` is a no-op, even with an invalid
  `maxPoints`, and does not call ECharts
- A failed ECharts update propagates its exception; Figure's local data has
  already changed, and a later successful `render()` or `update()` can resend it

## Verification boundary

`tests/browser-streaming.test.ts` uses the shared offline fake-ECharts harness,
executes the production Figure source, and checks both outgoing option patches
and a focused ID/position merge model. It covers repeated multi-series updates,
duplicate names, unnamed predecessors, every builder's identity, re-rendering,
missing indices, update failures, and timer-to-append delegation. Retention
regressions cover oversized initial arrays, the default limit, one-point and
changing limits, invalid bounds without data mutation or timer allocation,
missing targets, disposed streams, and failure recovery.

These tests do not run the ECharts renderer or prove browser animation,
interaction, visual output, package builds, or real ECharts integration. Run
the declared `npm test` after installing the declared development dependencies;
the offline checkpoint used the already available Node 24/esbuild/TypeScript
5.9 and Bun 1.3.14 toolchains instead of the unavailable declared tsx workflow.
