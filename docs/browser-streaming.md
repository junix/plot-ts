# Browser streaming series selection

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

## Existing behavior retained

- A missing series index is a no-op and does not call ECharts
- A failed ECharts update propagates its exception; Figure's local data has
  already changed, and a later successful `render()` or `update()` can resend it
- `maxPoints` removes at most one old point per append. A series already larger
  than that limit is not immediately reduced to the limit. Input validation and
  a strict retention-cap redesign are separate work

## Verification boundary

`tests/browser-streaming.test.ts` uses the shared offline fake-ECharts harness,
executes the production Figure source, and checks both outgoing option patches
and a focused ID/position merge model. It covers repeated multi-series updates,
duplicate names, unnamed predecessors, every builder's identity, re-rendering,
missing indices, update failures, and timer-to-append delegation.

These tests do not run the ECharts renderer or prove browser animation,
interaction, visual output, package builds, or real ECharts integration. Run
the declared `npm test` after installing the declared development dependencies;
the offline checkpoint used the already available Node 24/esbuild/TypeScript
5.9 and Bun 1.3.14 toolchains instead of the unavailable declared tsx workflow.
