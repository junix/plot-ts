import assert from 'node:assert/strict'
import test from 'node:test'
import { createBrowserHarness } from './helpers/browser-figure.js'

// Verify the options sent by the real Figure implementation to the shared
// ECharts mock. These are option-contract tests, not browser-rendering tests.
function setup() {
  const harness = createBrowserHarness()
  const figure = new harness.Figure({ style: {} } as HTMLElement)
  const chart = harness.charts[0]!
  const option = () => chart.setOptionCalls.at(-1)!.option
  return { figure, chart, option }
}

test('heatmap forwards supplied row labels in matrix order without transposing an asymmetric matrix', () => {
  const { figure, option } = setup()
  assert.equal(figure.heatmap(
    [[11, 12, 13], [21, 22, 23]],
    ['Mon', 'Tue', 'Wed'],
    ['South', 'North'],
  ), figure)
  figure.render()

  assert.equal(option().xAxis.type, 'category')
  assert.equal(option().yAxis.type, 'category')
  assert.deepEqual(option().xAxis.data, ['Mon', 'Tue', 'Wed'])
  assert.deepEqual(option().yAxis.data, ['South', 'North'])
  assert.deepEqual(option().series[0].data, [
    [0, 0, 11], [1, 0, 12], [2, 0, 13],
    [0, 1, 21], [1, 1, 22], [2, 1, 23],
  ])
})

test('heatmap generates string row indices when labels are omitted', () => {
  const { figure, option } = setup()
  figure.heatmap([[1, 2, 3], [4, 5, 6]]).render()
  assert.equal(option().yAxis.type, 'category')
  assert.deepEqual(option().xAxis.data, ['0', '1', '2'])
  assert.deepEqual(option().yAxis.data, ['0', '1'])
})

test('heatmap treats empty label arrays as defaults using the separate row and column counts', () => {
  const { figure, option } = setup()
  figure.heatmap([[1, 2], [3, 4], [5, 6]], [], []).render()
  assert.deepEqual(option().xAxis.data, ['0', '1'])
  assert.deepEqual(option().yAxis.data, ['0', '1', '2'])
  assert.deepEqual(option().series[0].data, [
    [0, 0, 1], [1, 0, 2],
    [0, 1, 3], [1, 1, 4],
    [0, 2, 5], [1, 2, 6],
  ])
})

test('heatmap keeps supplied row labels including empty text while defaulting column labels', () => {
  const { figure, option } = setup()
  figure.heatmap([[1, 2], [3, 4]], [], ['North', '']).render()
  assert.deepEqual(option().xAxis.data, ['0', '1'])
  assert.deepEqual(option().yAxis.data, ['North', ''])
})

test('heatmap defaults row labels independently of supplied column labels', () => {
  const { figure, option } = setup()
  figure.heatmap([[1], [2], [3]], ['Temperature']).render()
  assert.deepEqual(option().xAxis.data, ['Temperature'])
  assert.deepEqual(option().yAxis.data, ['0', '1', '2'])
})

for (const placement of ['before', 'after'] as const) {
  test(`heatmap preserves axis names and label style when configured ${placement} the data`, () => {
    const { figure, option } = setup()
    const configureAxes = () => figure.xAxis({ label: 'Day' }).yAxis({ label: 'Region' })
    if (placement === 'before') configureAxes()
    figure.heatmap([[1, 2], [3, 4]], ['Mon', 'Tue'], ['East', 'West'])
    if (placement === 'after') configureAxes()
    figure.render()

    assert.equal(option().xAxis.name, 'Day')
    assert.equal(option().yAxis.name, 'Region')
    assert.equal(option().xAxis.type, 'category')
    assert.equal(option().yAxis.type, 'category')
    assert.deepEqual(option().xAxis.data, ['Mon', 'Tue'])
    assert.deepEqual(option().yAxis.data, ['East', 'West'])
    assert.deepEqual(option().xAxis.axisLabel, { fontSize: 11 })
    assert.deepEqual(option().yAxis.axisLabel, { fontSize: 11 })
  })
}

test('update forwards heatmap row labels on the first and every later render', () => {
  const { figure, chart, option } = setup()
  figure.heatmap([[1, 2], [3, 4]], ['A', 'B'], ['Top', 'Bottom'])
  figure.update()
  const first = option()
  assert.deepEqual(first.yAxis.data, ['Top', 'Bottom'])
  figure.title('Updated title')
  figure.update()
  figure.update()

  assert.equal(chart.setOptionCalls.length, 3)
  for (const { option: output } of chart.setOptionCalls) {
    assert.deepEqual(output.yAxis.data, ['Top', 'Bottom'])
    assert.deepEqual(output.xAxis.data, ['A', 'B'])
    assert.deepEqual(output.series, first.series)
  }
  assert.equal(option().title.text, 'Updated title')
  assert.equal(first.title.text, '')
})

test('update forwards the latest category rows when another heatmap changes the axis data', () => {
  const { figure, chart, option } = setup()
  figure.heatmap([[1, 2]], ['A', 'B'], ['Old']).render()
  const first = option()
  figure.heatmap([[3], [4], [5]], ['C'], ['New 1', 'New 2', 'New 3'])
  figure.update()

  assert.equal(chart.setOptionCalls.length, 2)
  assert.deepEqual(first.yAxis.data, ['Old'])
  assert.deepEqual(option().yAxis.data, ['New 1', 'New 2', 'New 3'])
  assert.deepEqual(option().xAxis.data, ['C'])
  assert.deepEqual(option().series[0], first.series[0])
  assert.deepEqual(option().series[1].data, [[0, 0, 3], [0, 1, 4], [0, 2, 5]])
})

test('numeric charts keep their value axis without category row data', () => {
  const { figure, option } = setup()
  figure.plot([1, 2], [3, 4]).yAxis({ label: 'Value' }).render()
  assert.equal(option().yAxis.type, 'value')
  assert.equal(option().yAxis.name, 'Value')
  assert.equal(option().yAxis.data, undefined)
  assert.deepEqual(option().yAxis.axisLabel, { fontSize: 11 })
  assert.deepEqual(option().series[0].data, [[1, 3], [2, 4]])
})
