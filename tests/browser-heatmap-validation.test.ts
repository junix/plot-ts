import assert from 'node:assert/strict'
import test from 'node:test'
import { createBrowserHarness } from './helpers/browser-figure.js'

// Exercise the actual Figure source through the shared ECharts option mock.
// These assertions cover inputs/options, not ECharts rendering or color output.
function setup() {
  const harness = createBrowserHarness()
  const figure = new harness.Figure({ style: {} } as HTMLElement)
  const chart = harness.charts[0]!
  const option = () => chart.setOptionCalls.at(-1)!.option
  return { figure, chart, option }
}

const malformedMatrices: [string, unknown][] = [
  ['short row', [[1, 2], [3]]],
  ['long row', [[1], [2, 3]]],
  ['empty first row followed by values', [[], [1]]],
  ['values followed by empty row', [[1], []]],
  ['NaN', [[1, 2], [3, NaN]]],
  ['positive infinity', [[1, Infinity]]],
  ['negative infinity', [[-Infinity]]],
  ['numeric string', [[1, '2']]],
  ['null cell', [[null]]],
  ['undefined cell', [[undefined]]],
  ['sparse cell', [new Array(1)]],
  ['null row', [[1], null]],
  ['non-array row', ['12']],
  ['sparse row', new Array(1)],
  ['null matrix', null],
  ['array-like matrix', { 0: [1], length: 1 }],
]

for (const [name, matrix] of malformedMatrices) {
  test(`heatmap rejects ${name} before changing series, axes, IDs, or chart options`, () => {
    const { figure, chart, option } = setup()
    figure.plot([1, 2], [3, 4], { name: 'existing' })
      .xAxis({ label: 'Time', min: 0, max: 10, grid: true })
      .yAxis({ label: 'Value', min: -1, max: 5 }).render()
    const before = option()
    assert.throws(() => figure.heatmap(matrix as number[][], ['Changed X'], ['Changed Y']), RangeError)
    assert.equal(chart.setOptionCalls.length, 1)
    figure.update()
    assert.deepEqual(option(), before)
    figure.heatmap([[5]], ['X'], ['Y']).render()
    assert.equal(option().series.length, 2)
    assert.equal(option().series[1].id, 'plot-ts-series-1')
    assert.deepEqual(option().series[0], before.series[0])
  })
}

for (const axis of ['x', 'y'] as const) {
  for (const [name, labels] of [
    ['number', [1]],
    ['null', null],
    ['string', 'labels'],
    ['sparse array', new Array(1)],
    ['invalid extra entry', ['good', 2]],
  ] as [string, unknown][]) {
    test(`heatmap rejects ${axis} labels with ${name} before changing an existing heatmap`, () => {
      const { figure, chart, option } = setup()
      figure.heatmap([[1, 2]], ['A', 'B'], ['Original']).render()
      const before = option()
      assert.throws(() => figure.heatmap(
        [[3]],
        axis === 'x' ? labels as string[] : ['New X'],
        axis === 'y' ? labels as string[] : ['New Y'],
      ), RangeError)
      assert.equal(chart.setOptionCalls.length, 1)
      figure.render()
      assert.deepEqual(option(), before)
    })
  }
}

for (const [name, matrix, xLabels, yLabels] of [
  ['no rows', [], [], []],
  ['one empty row', [[]], [], ['0']],
  ['multiple empty rows', [[], [], []], [], ['0', '1', '2']],
] as [string, number[][], string[], string[]][]) {
  test(`empty heatmap with ${name} has an empty series and a finite default domain`, () => {
    const { figure, option } = setup()
    figure.heatmap(matrix).render()
    assert.deepEqual(option().series[0].data, [])
    assert.deepEqual(option().xAxis.data, xLabels)
    assert.deepEqual(option().yAxis.data, yLabels)
    assert.equal(option().visualMap.min, 0)
    assert.equal(option().visualMap.max, 1)
  })
}

test('empty shape clips supplied labels to its actual dimensions', () => {
  const { figure, option } = setup()
  figure.heatmap([[], []], ['unused'], ['first', 'second', 'unused']).render()
  assert.deepEqual(option().xAxis.data, [])
  assert.deepEqual(option().yAxis.data, ['first', 'second'])
})

test('partial labels keep missing columns and rows as blank categories', () => {
  const { figure, option } = setup()
  figure.heatmap([[1, 2, 3], [4, 5, 6]], ['First'], ['Top']).render()
  assert.deepEqual(option().xAxis.data, ['First', '', ''])
  assert.deepEqual(option().yAxis.data, ['Top', ''])
  assert.deepEqual(option().series[0].data, [
    [0, 0, 1], [1, 0, 2], [2, 0, 3], [0, 1, 4], [1, 1, 5], [2, 1, 6],
  ])
})

test('extra labels are ignored without creating categories beyond the matrix', () => {
  const { figure, option } = setup()
  figure.heatmap([[1, 2]], ['A', '', 'unused'], ['Row', 'unused']).render()
  assert.deepEqual(option().xAxis.data, ['A', ''])
  assert.deepEqual(option().yAxis.data, ['Row'])
})

test('matrix and labels are snapshotted before caller mutations', () => {
  const { figure, option } = setup()
  const data = [[1, 2], [3, 4]]
  const xLabels = ['A', 'B']
  const yLabels = ['Top', 'Bottom']
  figure.heatmap(data, xLabels, yLabels)
  data[0]![0] = NaN
  data.push([Infinity])
  xLabels[0] = 'Changed'
  yLabels.pop()
  figure.render()
  assert.deepEqual(option().series[0].data, [[0, 0, 1], [1, 0, 2], [0, 1, 3], [1, 1, 4]])
  assert.deepEqual(option().xAxis.data, ['A', 'B'])
  assert.deepEqual(option().yAxis.data, ['Top', 'Bottom'])
  assert.equal(option().visualMap.min, 1)
  assert.equal(option().visualMap.max, 4)
  figure.update()
  assert.deepEqual(option().xAxis.data, ['A', 'B'])
})

for (const value of [0, -0, 1, -1, 500, -500, Number.MIN_VALUE, -Number.MIN_VALUE, Number.MAX_VALUE, -Number.MAX_VALUE]) {
  test(`constant heatmap ${Object.is(value, -0) ? '-0' : value} has finite distinct bounds containing its value`, () => {
    const { figure, option } = setup()
    figure.heatmap([[value, value], [value, value]]).render()
    const { min, max } = option().visualMap
    assert.ok(Number.isFinite(min))
    assert.ok(Number.isFinite(max))
    assert.ok(min < max)
    assert.ok(min <= value && value <= max)
    assert.deepEqual(option().series[0].data, [[0, 0, value], [1, 0, value], [0, 1, value], [1, 1, value]])
  })
}

test('ordinary constants use symmetric one-unit or one-percent domain padding', () => {
  for (const [value, min, max] of [[0, -1, 1], [2, 1, 3], [500, 495, 505], [-500, -505, -495]]) {
    const { figure, option } = setup()
    figure.heatmap([[value!]]).render()
    assert.equal(option().visualMap.min, min)
    assert.equal(option().visualMap.max, max)
  }
})

test('nonconstant finite endpoints are preserved, including an extreme span', () => {
  const { figure, option } = setup()
  figure.heatmap([[-Number.MAX_VALUE, 0, Number.MAX_VALUE]]).render()
  assert.equal(option().visualMap.min, -Number.MAX_VALUE)
  assert.equal(option().visualMap.max, Number.MAX_VALUE)
  // This verifies emitted endpoints only, not ECharts normalization arithmetic.
})

test('shared heatmap domain includes later heatmaps and excludes other series', () => {
  const { figure, option } = setup()
  figure.scatter([0], [1e9]).heatmap([[5, 6]]).plot([0], [-1e9]).heatmap([[-10, 20]]).render()
  assert.equal(option().visualMap.min, -10)
  assert.equal(option().visualMap.max, 20)
  assert.deepEqual(option().series.map((series: { id: string }) => series.id), [
    'plot-ts-series-0', 'plot-ts-series-1', 'plot-ts-series-2', 'plot-ts-series-3',
  ])
  figure.heatmap([[-25, 12]]).update()
  assert.equal(option().visualMap.min, -25)
  assert.equal(option().visualMap.max, 20)
})

for (const emptyFirst of [true, false]) {
  test(`empty heatmaps do not affect a nonempty shared domain (${emptyFirst ? 'empty first' : 'empty last'})`, () => {
    const { figure, option } = setup()
    if (emptyFirst) figure.heatmap([])
    figure.heatmap([[-2, 7]])
    if (!emptyFirst) figure.heatmap([[], []])
    figure.render()
    assert.equal(option().visualMap.min, -2)
    assert.equal(option().visualMap.max, 7)
  })
}

test('a shared domain spanning two constant heatmaps uses their actual endpoints', () => {
  const { figure, option } = setup()
  figure.heatmap([[3, 3]]).heatmap([[9, 9]]).render()
  assert.equal(option().visualMap.min, 3)
  assert.equal(option().visualMap.max, 9)
})

test('large rectangular heatmap renders without spreading every value into a function call', () => {
  const { figure, option } = setup()
  const rows = 300
  const columns = 500
  const data = Array.from({ length: rows }, (_, row) => Array.from({ length: columns }, (_, col) => row * columns + col - 10))
  assert.doesNotThrow(() => figure.heatmap(data).render())
  assert.equal(option().series[0].data.length, rows * columns)
  assert.deepEqual(option().series[0].data[0], [0, 0, -10])
  assert.deepEqual(option().series[0].data.at(-1), [columns - 1, rows - 1, rows * columns - 11])
  assert.equal(option().visualMap.min, -10)
  assert.equal(option().visualMap.max, rows * columns - 11)
})

test('figures without heatmaps still have no visualMap', () => {
  const { figure, option } = setup()
  figure.plot([1, 2], [3, 4]).render()
  assert.equal(option().visualMap, undefined)
})

for (const invalid of ['matrix', 'labels'] as const) {
  test(`invalid ${invalid} does not select a shared heatmap palette`, () => {
    const { figure, chart, option } = setup()
    assert.throws(() => figure.heatmap(
      invalid === 'matrix' ? [[NaN]] : [[1]],
      invalid === 'labels' ? [1] as unknown as string[] : [],
      [],
      { colormap: 'plasma' },
    ), RangeError)
    assert.equal(chart.setOptionCalls.length, 0)
    assert.doesNotThrow(() => figure.heatmap([[2]], [], [], { colormap: 'viridis' }).render())
    assert.equal(option().series.length, 1)
    assert.equal(option().series[0].id, 'plot-ts-series-0')
  })
}
