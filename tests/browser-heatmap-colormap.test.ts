import assert from 'node:assert/strict'
import test from 'node:test'
import type { HeatmapConfig } from '../src/core/plotter.js'
import { COLORS } from '../src/style/palette.js'
import { createBrowserHarness } from './helpers/browser-figure.js'

// Real Figure and real palette, with only ECharts/browser globals mocked by the
// existing shared harness. These verify emitted options, not rendered pixels.
function setup() {
  const harness = createBrowserHarness()
  const figure = new harness.Figure({ style: {} } as HTMLElement)
  const chart = harness.charts[0]!
  const option = () => chart.setOptionCalls.at(-1)!.option
  return { figure, chart, option }
}

for (const colormap of ['viridis', 'plasma', 'blues', 'rdbu', 'heat'] as const) {
  test(`browser heatmap forwards every exact COLORS.${colormap} stop`, () => {
    const { figure, option } = setup()
    assert.equal(figure.heatmap([[-2, 0], [5, 1]], ['A', 'B'], ['Top', 'Bottom'], {
      colormap, showValues: true,
    }), figure)
    figure.render()

    assert.deepEqual(option().visualMap.inRange.color, COLORS[colormap])
    assert.deepEqual(option().visualMap.seriesIndex, [0])
    assert.equal(option().visualMap.dimension, 2)
    assert.equal(option().visualMap.min, -2)
    assert.equal(option().visualMap.max, 5)
    assert.deepEqual(option().series[0].data, [[0, 0, -2], [1, 0, 0], [0, 1, 5], [1, 1, 1]])
    assert.deepEqual(option().series[0].label, { show: true, fontSize: 10 })
    assert.deepEqual(option().xAxis.data, ['A', 'B'])
    assert.deepEqual(option().yAxis.data, ['Top', 'Bottom'])
  })
}

test('heat has its own black/red/yellow/white color ramp rather than an alias', () => {
  assert.deepEqual(COLORS.heat, ['#000000', '#ff0000', '#ffff00', '#ffffff'])
  const { figure, option } = setup()
  figure.heatmap([[0, 1]], [], [], { colormap: 'heat' }).render()
  assert.deepEqual(option().visualMap.inRange.color, ['#000000', '#ff0000', '#ffff00', '#ffffff'])
})

test('first omitted or explicit undefined colormap keeps the original viridis stops and controls', () => {
  for (const config of [{}, { colormap: undefined }] as HeatmapConfig[]) {
    const { figure, option } = setup()
    figure.heatmap([[0, 1]], [], [], config).render()
    assert.deepEqual(option().visualMap, {
      seriesIndex: [0], dimension: 2, min: 0, max: 1,
      calculable: true, orient: 'horizontal', left: 'center', bottom: '5%',
      inRange: { color: COLORS.viridis },
    })
  }
})

test('explicit viridis is option-equivalent to the omitted default', () => {
  const omitted = setup()
  const explicit = setup()
  omitted.figure.heatmap([[0, 1]]).render()
  explicit.figure.heatmap([[0, 1]], [], [], { colormap: 'viridis' }).render()
  assert.deepEqual(explicit.option(), omitted.option())
})

for (const config of [{}, { colormap: undefined }, { colormap: 'plasma' }] as HeatmapConfig[]) {
  test(`later heatmap ${String(config.colormap)} keeps the first plasma palette`, () => {
    const { figure, option } = setup()
    figure.heatmap([[0, 1]], ['A', 'B'], ['First'], { colormap: 'plasma' })
    figure.heatmap([[1, 0]], ['A', 'B'], ['Second'], config).render()
    assert.deepEqual(option().visualMap.inRange.color, COLORS.plasma)
    assert.deepEqual(option().visualMap.seriesIndex, [0, 1])
    assert.equal(option().visualMap.dimension, 2)
    assert.equal(Array.isArray(option().visualMap), false)
    assert.equal(option().series.length, 2)
  })
}

test('selected palette remains stable across render/update and caller config mutation', () => {
  const { figure, chart, option } = setup()
  const config: HeatmapConfig = { colormap: 'rdbu' }
  figure.heatmap([[0, 1]], [], [], config).render()
  config.colormap = 'plasma'
  figure.title('Updated').update()
  figure.update()
  assert.equal(chart.setOptionCalls.length, 3)
  assert.equal(option().title.text, 'Updated')
  for (const { option: output } of chart.setOptionCalls) {
    assert.deepEqual(output.visualMap.inRange.color, COLORS.rdbu)
    assert.deepEqual(output.visualMap.seriesIndex, [0])
  }
})

test('visualMap targets only heatmap series even when other series surround them', () => {
  const { figure, option } = setup()
  figure.plot([0, 1], [10, 20], { color: '#123456' })
    .heatmap([[0, 1]], [], [], { colormap: 'blues' })
    .scatter([0, 1], [30, 40], { color: '#654321' })
    .heatmap([[1, 0]])
    .area([0, 1], [50, 60], { color: '#abcdef' })
    .render()
  assert.deepEqual(option().visualMap.seriesIndex, [1, 3])
  assert.equal(option().visualMap.dimension, 2)
  assert.deepEqual(option().visualMap.inRange.color, COLORS.blues)
  for (const [index, color] of [[0, '#123456'], [2, '#654321'], [4, '#abcdef']] as const) {
    assert.equal(option().series[index].itemStyle.color, color)
  }
})

test('numeric-only charts do not gain a visualMap', () => {
  const { figure, option } = setup()
  figure.plot([0, 1], [2, 3]).scatter([0, 1], [4, 5]).render()
  assert.equal(option().visualMap, undefined)
})

for (const invalid of ['__proto__', 'constructor', 'toString', 'tableau', 'primary', 'inferno', '', null, 42, false, {}, ['plasma']]) {
  for (const data of [[[0, 1]], []]) {
    test(`unsupported palette ${JSON.stringify(invalid)} rejects before any mutation with ${data.length} rows`, () => {
      const { figure, chart, option } = setup()
      figure.plot([0, 1], [10, 20]).xAxis({ label: 'Original X' }).yAxis({ label: 'Original Y' }).render()
      const before = option()
      const calls = chart.setOptionCalls.length
      assert.throws(() => figure.heatmap(data, ['Changed'], ['Changed'], {
        colormap: invalid as HeatmapConfig['colormap'] & {},
      }), {
        name: 'RangeError',
        message: 'Unsupported heatmap colormap. Use viridis, plasma, blues, rdbu, or heat.',
      })
      assert.equal(chart.setOptionCalls.length, calls)
      figure.update()
      assert.deepEqual(option(), before)
      // A rejected first heatmap must not establish a palette or consume an ID.
      figure.heatmap([[0, 1]], [], [], { colormap: 'plasma' }).update()
      assert.equal(option().series.length, 2)
      assert.equal(option().series[1].id, 'plot-ts-series-1')
      assert.deepEqual(option().visualMap.inRange.color, COLORS.plasma)
    })
  }
}

for (const first of ['viridis', 'plasma', 'blues', 'rdbu', 'heat'] as const) {
  const conflicting = first === 'plasma' ? 'blues' : 'plasma'
  for (const data of [[[2, 3]], []]) {
    test(`conflicting ${conflicting} after ${first} rejects atomically with ${data.length} rows`, () => {
      const { figure, chart, option } = setup()
      figure.heatmap([[0, 1]], ['A', 'B'], ['Original'], { colormap: first }).render()
      const before = option()
      const calls = chart.setOptionCalls.length
      assert.throws(() => figure.heatmap(data, ['Changed'], ['Changed'], { colormap: conflicting }), {
        name: 'RangeError', message: 'Heatmaps in one Figure must use the same colormap.',
      })
      assert.equal(chart.setOptionCalls.length, calls)
      figure.update()
      assert.deepEqual(option(), before)
      figure.heatmap([[1, 0]]).update()
      assert.equal(option().series.length, 2)
      assert.equal(option().series[1].id, 'plot-ts-series-1')
      assert.deepEqual(option().visualMap.inRange.color, COLORS[first])
    })
  }
}

test('an omitted first palette still rejects an explicit later non-viridis palette', () => {
  const { figure, option } = setup()
  figure.heatmap([[0, 1]]).render()
  const before = option()
  assert.throws(() => figure.heatmap([[0, 1]], [], [], { colormap: 'plasma' }), {
    name: 'RangeError', message: 'Heatmaps in one Figure must use the same colormap.',
  })
  figure.update()
  assert.deepEqual(option(), before)
})

test('each Figure from the same module establishes its own independent palette', () => {
  const harness = createBrowserHarness()
  const first = new harness.Figure({ style: {} } as HTMLElement)
  const second = new harness.Figure({ style: {} } as HTMLElement)
  first.heatmap([[0, 1]], [], [], { colormap: 'plasma' }).render()
  second.heatmap([[0, 1]], [], [], { colormap: 'heat' }).render()
  first.update()
  assert.deepEqual(harness.charts[0]!.setOptionCalls.at(-1)!.option.visualMap.inRange.color, COLORS.plasma)
  assert.deepEqual(harness.charts[1]!.setOptionCalls.at(-1)!.option.visualMap.inRange.color, COLORS.heat)
})

test('downstream mutation of one emitted palette does not change later palette stops', () => {
  const { figure, chart, option } = setup()
  figure.heatmap([[0, 1]], [], [], { colormap: 'plasma' })
  const originalSetOption = chart.setOption.bind(chart)
  chart.setOption = (output, options) => {
    originalSetOption(output, options)
    output.visualMap.inRange.color[0] = '#123456'
  }
  figure.render()
  figure.update()
  assert.deepEqual(option().visualMap.inRange.color, COLORS.plasma)
})

test('an empty first heatmap still establishes the shared palette', () => {
  const { figure, option } = setup()
  figure.heatmap([], [], [], { colormap: 'heat' })
  assert.throws(() => figure.heatmap([[0, 1]], [], [], { colormap: 'blues' }), {
    name: 'RangeError', message: 'Heatmaps in one Figure must use the same colormap.',
  })
  figure.heatmap([[0, 1]]).render()
  assert.equal(option().series.length, 2)
  assert.deepEqual(option().visualMap.inRange.color, COLORS.heat)
  assert.deepEqual(option().visualMap.seriesIndex, [0, 1])
})
