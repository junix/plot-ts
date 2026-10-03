import assert from 'node:assert/strict'
import test from 'node:test'
import { createBrowserHarness } from './helpers/browser-figure.js'

type SeriesOption = Record<string, any>

function copy<T>(value: T): T {
  if (Array.isArray(value)) return value.map(copy) as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, copy(entry)])) as T
  }
  return value
}

// Focused normal-merge model, not an ECharts renderer. Match explicit IDs before
// using positional fallback for the anonymous data patches emitted by the old
// implementation. Tests independently inspect the outgoing patch as well.
// ECharts source: https://github.com/apache/echarts/blob/6.0.0/src/util/model.ts
function trackSeries(chart: any): { series: SeriesOption[]; patches: any[] } {
  const model = { series: [] as SeriesOption[], patches: [] as any[] }
  const originalSetOption = chart.setOption.bind(chart)
  chart.setOption = (option: any, ...args: any[]) => {
    originalSetOption(option, ...args)
    model.patches.push(copy(option))
    const used = new Set<number>()
    for (const update of option.series ?? []) {
      let index = update.id == null
        ? model.series.findIndex((_, i) => !used.has(i))
        : model.series.findIndex(series => series.id === update.id)
      if (index === -1) index = model.series.length
      assert.ok(!used.has(index), 'a patch must not address the same series twice')
      used.add(index)
      model.series[index] = { ...model.series[index], ...copy(update) }
    }
  }
  return model
}

function setup() {
  const harness = createBrowserHarness()
  const fig = new harness.Figure({ style: {} } as HTMLElement, { animated: false })
  const model = trackSeries(fig.getRawChart())
  return { harness, fig, model }
}

test('appendPoint updates the selected second series without changing the first', () => {
  const { fig, model } = setup()
  fig.plot([0, 1], [10, 11], { name: 'first', color: '#a00' })
    .scatter([0, 1], [20, 21], { name: 'second', color: '#00a' })
    .render()
  const before = copy(model.series)

  fig.appendPoint(2, 22, 1, 3)

  assert.deepEqual(model.series[0], before[0])
  assert.deepEqual(model.series[1]!.data, [[0, 20], [1, 21], [2, 22]])
  assert.deepEqual(model.series[1]!.itemStyle, before[1]!.itemStyle)
  assert.deepEqual(model.patches.at(-1), {
    series: [{ id: before[1]!.id, data: [[0, 20], [1, 21], [2, 22]] }],
  })
  assert.equal(model.series.length, 2)
})

test('duplicate user-facing names do not redirect a third-series append', () => {
  const { fig, model } = setup()
  fig.plot([0], [1], { name: 'same' })
    .scatter([0], [2], { name: 'same' })
    .area([0], [3], { name: 'same' })
    .render()
  const before = copy(model.series)

  fig.appendPoint(1, 30, 2)

  assert.deepEqual(model.series.slice(0, 2), before.slice(0, 2))
  assert.deepEqual(model.series[2]!.data, [[0, 3], [1, 30]])
  assert.equal(model.patches.at(-1).series[0].id, before[2]!.id)
  assert.equal(new Set(model.series.map(series => series.id)).size, 3)
})

test('unnamed heatmap and custom series preceding the target stay unchanged', () => {
  const { fig, model } = setup()
  fig.heatmap([[1, 2], [3, 4]])
    .violin(['group'], [[1, 2, 3, 4]])
    .plot([0], [5])
    .render()
  const before = copy(model.series)

  fig.appendPoint(1, 6, 2)

  assert.deepEqual(model.series.slice(0, 2), before.slice(0, 2))
  assert.deepEqual(model.series[2]!.data, [[0, 5], [1, 6]])
  assert.equal(model.series.length, 3)
})

test('all series builders receive unique IDs that survive render and update', () => {
  const { fig, model } = setup()
  fig.plot([0], [1])
    .scatter([0], [2])
    .bar(['a'], [3])
    .heatmap([[4]])
    .violin(['a'], [[1, 2, 3]])
    .area([0], [6])
    .render()
  const ids = model.series.map(series => series.id)
  assert.ok(ids.every(id => typeof id === 'string' && id.length > 0))
  assert.equal(new Set(ids).size, 6)

  fig.appendPoint(1, 7, 5)
  fig.render()
  fig.update()

  assert.deepEqual(model.series.map(series => series.id), ids)
  assert.deepEqual(model.series[5]!.data, [[0, 6], [1, 7]])
  assert.equal(model.series.length, 6)
})

test('adding and rendering another series preserves previously assigned IDs', () => {
  const { fig, model } = setup()
  fig.plot([0], [10]).scatter([0], [20]).render()
  const ids = model.series.map(series => series.id)
  fig.area([0], [30]).render()
  assert.deepEqual(model.series.slice(0, 2).map(series => series.id), ids)
  assert.ok(!ids.includes(model.series[2]!.id))

  fig.appendPoint(1, 31, 2)
  assert.deepEqual(model.series.map(series => series.data), [
    [[0, 10]], [[0, 20]], [[0, 30], [1, 31]],
  ])
})

test('interleaved appends preserve each selected series and its retention window', () => {
  const { fig, model } = setup()
  fig.plot([0, 1], [10, 11])
    .scatter([0, 1], [20, 21])
    .area([0, 1], [30, 31])
    .render()
  fig.appendPoint(2, 32, 2, 2)
  fig.appendPoint(2, 22, 1, 2)
  fig.appendPoint(3, 33, 2, 2)
  fig.appendPoint(2, 12, 0, 2)
  fig.appendPoint(3, 23, 1, 2)

  assert.deepEqual(model.series.map(series => series.data), [
    [[1, 11], [2, 12]], [[2, 22], [3, 23]], [[2, 32], [3, 33]],
  ])
  assert.equal(model.series.length, 3)
})

test('the omitted series index still targets the first series', () => {
  const { fig, model } = setup()
  fig.plot([0], [10]).scatter([0], [20]).render()
  const second = copy(model.series[1])
  fig.appendPoint(1, 11)
  assert.deepEqual(model.series[0]!.data, [[0, 10], [1, 11]])
  assert.deepEqual(model.series[1], second)
})

test('missing series indices remain no-ops with no ECharts update', () => {
  const { fig, model } = setup()
  fig.appendPoint(1, 2)
  assert.equal(model.patches.length, 0)
  fig.plot([0], [10]).scatter([0], [20]).render()
  const before = copy(model.series)
  const calls = model.patches.length
  for (const index of [-1, 2, 100, 0.5, NaN, Infinity]) {
    fig.appendPoint(1, 2, index)
  }
  assert.equal(model.patches.length, calls)
  assert.deepEqual(model.series, before)
})

test('ECharts update failures propagate and a later render resynchronizes data', () => {
  const { fig, model } = setup()
  fig.plot([0], [10]).scatter([0], [20]).render()
  const chart = fig.getRawChart() as any
  const originalSetOption = chart.setOption
  const failure = new Error('simulated setOption failure')
  chart.setOption = () => { throw failure }
  assert.throws(() => fig.appendPoint(1, 21, 1), error => error === failure)
  chart.setOption = originalSetOption

  fig.update()
  assert.deepEqual(model.series.map(series => series.data), [
    [[0, 10]], [[0, 20], [1, 21]],
  ])
})

test('stream passes its selected series index through repeated timer ticks', () => {
  const { harness, fig, model } = setup()
  fig.plot([0], [10]).scatter([0], [20]).area([0], [30]).render()
  let nextX = 0
  const stop = fig.stream(() => ({ x: ++nextX, y: 30 + nextX }), 100, 2, 2)
  harness.timers.tick()
  harness.timers.tick()
  stop()

  assert.deepEqual(model.series.map(series => series.data), [
    [[0, 10]], [[0, 20]], [[1, 31], [2, 32]],
  ])
  assert.equal(model.series.length, 3)
})
