import test from 'node:test'
import assert from 'node:assert/strict'
import { color } from 'echarts'
import { EChartsSurfaceGuard } from '../src/core/surface.js'
import { CANONICAL_THEME_NAMES, getCanonicalTheme } from '../src/style/canonical.js'
import { createBrowserHarness, FakeChart } from './helpers/browser-figure.js'

const container = () => ({ style: {} }) as HTMLElement
const policies = ['transparent-root-v1', 'transparent-auto-v1'] as const
const themes = [undefined, 'dark', ...CANONICAL_THEME_NAMES]
function make(h: ReturnType<typeof createBrowserHarness>, theme: string | undefined, policy?: string) {
  return new h.Figure(container(), { animated: false, ...(theme ? { theme } : {}), ...(policy ? { surfacePolicy: policy as any } : {}) })
    .plot([0, 1], [2, 4], { color: '#123456', name: 'line' })
    .scatter([0, 1], [4, 2], { color: 'transparent', name: 'scatter' })
    .bar(['A', 'B'], [2, 3]).area([0, 1], [3, 5])
    .heatmap([[0, 1], [2, 3]], ['A', 'B'], ['C', 'D'], { colormap: 'plasma' })
}

for (const theme of themes) {
  test(`${theme ?? 'default'}: explicit themed-v1 preserves all options, themes and export settings`, () => {
    const h = createBrowserHarness()
    const a = make(h, theme), b = make(h, theme, 'themed-v1')
    a.render(); b.render(); a.exportImage(); b.exportImage(); a.exportImage('jpeg'); b.exportImage('jpeg')
    const normalize = (value: unknown) => JSON.stringify(value, (_key, entry) => typeof entry === 'function' ? String(entry) : entry)
    assert.equal(normalize(h.charts[0]!.options), normalize(h.charts[1]!.options))
    assert.deepEqual(h.initThemes[0], h.initThemes[1])
    assert.deepEqual(h.charts[0]!.exportCalls, h.charts[1]!.exportCalls)
    assert.equal(a.getRawChart().setOption, FakeChart.prototype.setOption)
    assert.equal(b.getRawChart().setOption, FakeChart.prototype.setOption)
    a.dispose(); b.dispose()
  })
  for (const policy of policies) test(`${theme ?? 'default'}/${policy}: owned backgrounds clear and semantic series remain`, () => {
    const h = createBrowserHarness(), fig = make(h, theme, policy)
    fig.render()
    const option = h.charts[0]!.options[0]
    assert.equal(option.backgroundColor, 'transparent')
    assert.equal(option.grid.backgroundColor, policy === 'transparent-auto-v1' ? 'transparent' : undefined)
    for (const key of ['tooltip', 'legend', 'visualMap']) assert.equal(option[key].backgroundColor, policy === 'transparent-auto-v1' ? 'transparent' : undefined)
    if (policy === 'transparent-auto-v1') {
      for (const axis of ['xAxis', 'yAxis']) assert.equal(option[axis].axisPointer.label.backgroundColor, 'transparent')
      assert.equal(option.tooltip.axisPointer.label.backgroundColor, 'transparent')
      assert.equal(option.axisPointer.label.backgroundColor, 'transparent')
    }
    assert.equal(option.series[0].lineStyle.color, '#123456')
    assert.equal(option.series[1].itemStyle.color, 'transparent')
    assert.deepEqual(option.series[0].data, [[0, 2], [1, 4]])
    assert.deepEqual(option.visualMap.inRange.color, ['#0d0887','#46039f','#7201a8','#9c179e','#bd3786','#d8576b','#ed7953','#fb9f3a','#fdca26','#f0f921'])
    fig.update(); fig.exportImage()
    assert.deepEqual(h.charts[0]!.exportCalls[0], { type: 'png', pixelRatio: 2, backgroundColor: 'transparent' })
    assert.equal(fig.getRawChart(), fig.getECharts())
    fig.dispose()
    assert.equal(h.charts[0]!.setOption, FakeChart.prototype.setOption)
    assert.equal(h.window.resizeListeners.size, 0)
  })
}

const paths: Array<[string, any]> = [
  ['root', { backgroundColor: 'red' }],
  ['grid array', { grid: [{ id: 'authored', backgroundColor: '#abcdef' }] }],
  ['tooltip', { tooltip: { backgroundColor: 'rgba(1,2,3,.5)' } }],
  ['legend', { legend: [{ backgroundColor: { image: 'authored.png' } }] }],
  ['visualMap', { visualMap: { backgroundColor: '#00000001' } }],
  ['axisPointer', { axisPointer: { label: { backgroundColor: '#ff0000' } } }],
  ['xAxis', { xAxis: [{ axisPointer: { label: { backgroundColor: '#abc' } } }] }],
  ['yAxis', { yAxis: { axisPointer: { label: { backgroundColor: 'auto' } } } }],
  ['tooltip pointer', { tooltip: { axisPointer: { label: { backgroundColor: 'white' } } } }],
  ['tooltip CSS', { tooltip: { extraCssText: 'background: red !important' } }],
  ['tooltip class', { tooltip: { className: 'opaque-card' } }],
  ['cross text', { tooltip: { axisPointer: { crossStyle: { textStyle: { backgroundColor: 'white' } } } } }],
]
for (const [name, option] of paths) test(`authored ${name} conflict rejects before any raw mutation`, () => {
  const h = createBrowserHarness(), fig = make(h, 'sage-dark', 'transparent-auto-v1')
  fig.render(); const before = h.charts[0]!.setOptionCalls.length
  assert.throws(() => fig.getRawChart().setOption(option), /Surface policy conflict/)
  assert.equal(h.charts[0]!.setOptionCalls.length, before)
  assert.doesNotThrow(() => fig.exportImage())
  fig.dispose()
})

test('root-only permits authored inner backgrounds; clear CSS paints remain allowed', () => {
  const h = createBrowserHarness(), fig = make(h, 'sage-dark', 'transparent-root-v1')
  fig.render()
  fig.getRawChart().setOption({ grid: { backgroundColor: 'red' }, tooltip: { backgroundColor: 'blue' } })
  fig.update(); assert.equal(h.charts[0]!.getOption().grid.backgroundColor, 'red')
  assert.doesNotThrow(() => fig.exportImage())
  for (const backgroundColor of ['transparent', 'rgba(12,34,56,0)', '#ffffff00']) {
    fig.getRawChart().setOption({ backgroundColor }); assert.doesNotThrow(() => fig.exportImage())
  }
  fig.dispose()
})

test('nested future baseOption/timeline/media paints are validated before mutation', () => {
  const h = createBrowserHarness(), fig = make(h, undefined, 'transparent-auto-v1')
  for (const nested of [
    { baseOption: { grid: { backgroundColor: 'red' } } },
    { options: [{}, { tooltip: { backgroundColor: 'red' } }] },
    { media: [{ query: { minWidth: 9999 }, option: { legend: { backgroundColor: 'red' } } }] },
  ]) assert.throws(() => fig.getRawChart().setOption(nested), /Surface policy conflict/)
  assert.equal(h.charts[0]!.setOptionCalls.length, 0)
  fig.dispose()
})

test('copy-on-write preserves functions, typed arrays, class/gradient objects and overload arguments', () => {
  const calls: any[] = []; const chart: any = { getOption: () => undefined, setOption(...args: any[]) { calls.push(args) } }
  const original = chart.setOption
  const guard = new EChartsSurfaceGuard(chart, 'transparent-auto-v1', color.parse)
  class Gradient { type = 'linear'; colorStops = [{ offset: 0, color: '#fff' }] }
  const gradient = new Gradient(), values = new Float64Array([1,2,3]), fn = (x: number) => x + 1
  const series = [{ data: values, itemStyle: { color: gradient }, renderItem: fn }]
  const graphic = [{ type: 'rect', shape: { x: 1, y: 2, width: 3, height: 4 }, style: { fill: 'white' } }]
  const query = { maxWidth: 500 }
  const option: any = { series, graphic, grid: [{ id: 'g' }], tooltip: { formatter: fn }, options: [{ series }], media: [{ query, option: { graphic } }] }
  const settings = { notMerge: true, replaceMerge: ['series'], lazyUpdate: true, silent: true }
  chart.setOption(option, settings); chart.setOption(option, false, true)
  const adapted = calls[0][0]
  assert.notEqual(adapted, option); assert.equal(adapted.series, series); assert.equal(adapted.graphic, graphic)
  assert.equal(adapted.series[0].data, values); assert.equal(adapted.series[0].itemStyle.color, gradient)
  assert.equal(adapted.tooltip.formatter, fn); assert.equal(adapted.media[0].query, query)
  assert.equal(adapted.media[0].option.graphic, graphic); assert.equal(adapted.options[0].series, series)
  assert.equal(calls[0][1], settings); assert.deepEqual(calls[1].slice(1), [false, true])
  assert.equal(option.backgroundColor, undefined); assert.equal(option.grid[0].backgroundColor, undefined)
  const bare = { graphic }; chart.setOption(bare)
  for (const key of ['grid','legend','visualMap','tooltip']) assert.ok(!(key in calls[2][0]), `must not create ${key}`)
  guard.restore(); assert.equal(chart.setOption, original)
})

test('prototype-bypassed live mutations are rejected before typed render/export/download', () => {
  let domWrites = 0
  const h = createBrowserHarness(process.cwd(), undefined, { createElement() { domWrites++; throw new Error('click path') } })
  const fig = make(h, 'sage-dark', 'transparent-auto-v1'); fig.render()
  FakeChart.prototype.setOption.call(h.charts[0], { grid: { backgroundColor: '#abcdef' } })
  const before = h.charts[0]!.setOptionCalls.length
  assert.throws(() => fig.update(), /live.*background/)
  assert.throws(() => fig.exportImage(), /live.*background/)
  assert.throws(() => fig.download(), /live.*background/)
  assert.equal(h.charts[0]!.setOptionCalls.length, before)
  assert.equal(h.charts[0]!.exportCalls.length, 0); assert.equal(domWrites, 0)
  fig.dispose()
})

test('transparent JPEG rejects before export, document access or download click', () => {
  let clicks = 0
  const h = createBrowserHarness(process.cwd(), undefined, { createElement() { clicks++; throw new Error('document') } })
  for (const policy of policies) {
    const fig = make(h, undefined, policy)
    assert.throws(() => fig.exportImage('jpeg'), /JPEG cannot preserve/)
    assert.throws(() => fig.download('x.jpg', 'jpeg'), /JPEG cannot preserve/)
    assert.equal(h.charts.at(-1)!.exportCalls.length, 0)
    fig.dispose()
  }
  assert.equal(clicks, 0)
})

test('malformed policy rejects before DOM/config reads, ECharts init and listeners', () => {
  const h = createBrowserHarness(); let effects = 0
  for (const surfacePolicy of [null, 'transparent', '', 'themed', {}, [], 1, true]) {
    const config = { surfacePolicy, get width() { effects++; return 800 } }
    const dom = { get style() { effects++; return {} } }
    assert.throws(() => new h.Figure(dom as HTMLElement, config as any), RangeError)
  }
  assert.equal(effects, 0); assert.equal(h.charts.length, 0); assert.equal(h.window.resizeListeners.size, 0)
})

test('pre-existing raw option ownership is rejected without patching its method', () => {
  const chart: any = { getOption: () => ({ backgroundColor: 'red' }), setOption() {} }
  const before = chart.setOption
  assert.throws(() => new EChartsSurfaceGuard(chart, 'transparent-auto-v1', color.parse), /ownership is unknown/)
  assert.equal(chart.setOption, before)
})


test('strong policy rejects unsupported tooltip container CSS, but preserves authored content', () => {
  const h = createBrowserHarness(), fig = make(h, 'sage-dark', 'transparent-auto-v1')
  fig.render(); const chart = fig.getRawChart()
  for (const extraCssText of ['background-image: url(x)', 'color: red', '/* custom */']) {
    assert.throws(() => chart.setOption({ tooltip: { extraCssText } }), /container CSS/)
  }
  const formatter = () => '<span style="background:white">authored content</span>'
  chart.setOption({ tooltip: { extraCssText: '', className: '', formatter } })
  assert.equal(h.charts[0]!.getOption().tooltip.formatter, formatter)
  FakeChart.prototype.setOption.call(h.charts[0], { tooltip: { extraCssText: 'background:white' } })
  assert.throws(() => fig.exportImage(), /container CSS/)
  fig.dispose()
  const root = make(h, undefined, 'transparent-root-v1')
  root.getRawChart().setOption({ tooltip: { extraCssText: 'background: white' } })
  assert.doesNotThrow(() => root.exportImage())
  root.dispose()
})


test('clear/notMerge owns the global pointer default ECharts itself always creates', () => {
  const calls: any[] = []
  const chart: any = { getOption: () => undefined, setOption(option: any) { calls.push(option) } }
  new EChartsSurfaceGuard(chart, 'transparent-auto-v1', color.parse)
  for (const axisPointer of [undefined, null, false, []]) {
    chart.setOption({ series: [], axisPointer }, true)
    assert.equal(calls.at(-1).axisPointer.label.backgroundColor, 'transparent')
    for (const key of ['grid', 'legend', 'visualMap']) assert.ok(!(key in calls.at(-1)))
  }
})


test('rejected direct and streamed appends preserve builder data and do not call generators', () => {
  const h = createBrowserHarness()
  const fig = new h.Figure(container(), { surfacePolicy: 'transparent-auto-v1', animated: false }).plot([0,1], [2,3])
  fig.render(); const chart = h.charts[0]!
  const corrupt = () => FakeChart.prototype.setOption.call(chart, { grid: { backgroundColor: 'red' } })
  const recover = () => {
    fig.getRawChart().setOption({ series: [] }, true)
    fig.render()
    assert.deepEqual(chart.options.at(-1).series[0].data, [[0,2],[1,3]])
  }
  corrupt()
  assert.throws(() => fig.appendPoint(2,4,0,2), /live.*background/)
  recover()
  let generated = 0
  const stop = fig.stream(() => { generated++; return { x: 2, y: 4 } }, 10, 2)
  corrupt()
  assert.throws(() => h.timers.tick(), /live.*background/)
  assert.equal(generated, 0)
  assert.equal(h.timers.active.size, 0, 'ownership failure stops the interval')
  assert.doesNotThrow(() => h.timers.tick(), 'no recurring error loop')
  stop()
  const count = h.timers.active.size
  assert.throws(() => fig.stream(() => ({x:2,y:4}), 10, 2), /live.*background/)
  assert.equal(h.timers.active.size, count)
  recover(); fig.dispose()
})


test('every typed mutation rejects before builder/renderer state changes under lost ownership', () => {
  const h = createBrowserHarness()
  const fig = new h.Figure(container(), { surfacePolicy: 'transparent-auto-v1', animated: false })
    .plot([0,1], [2,3], { name: 'original' }).title('Original').xAxis({label:'X'}).yAxis({label:'Y'}).grid(false)
  fig.render(); const chart = h.charts[0]!
  const stable = (option: any) => JSON.stringify(option, (_key, value) => typeof value === 'function' ? String(value) : value)
  const baseline = stable(chart.options.at(-1))
  const actions: Array<[string, () => unknown]> = [
    ['title', () => fig.title('changed')],
    ['xAxis', () => fig.xAxis({label:'changed',min:10,grid:true})],
    ['yAxis', () => fig.yAxis({label:'changed',min:10,grid:true})],
    ['grid', () => fig.grid(true)],
    ['plot', () => fig.plot([2],[4])],
    ['scatter', () => fig.scatter([2],[4])],
    ['bar', () => fig.bar(['changed'],[4])],
    ['heatmap', () => fig.heatmap([[1,2]],['changed'],['changed'],{colormap:'blues'})],
    ['violin', () => fig.violin(['changed'],[[1,2,3]])],
    ['area', () => fig.area([2],[4])],
    ['appendPoint', () => fig.appendPoint(2,4,0,1)],
    ['render', () => fig.render()],
    ['update', () => fig.update()],
    ['resize', () => fig.resize()],
    ['window resize', () => h.window.dispatchResize()],
  ]
  for (const [name, action] of actions) {
    FakeChart.prototype.setOption.call(chart, {grid:{backgroundColor:'red'}})
    const calls = chart.setOptionCalls.length, resizes = chart.resizeCalls
    assert.throws(action, /live.*background/, name)
    assert.equal(chart.setOptionCalls.length,calls,name)
    assert.equal(chart.resizeCalls,resizes,name)
    fig.getRawChart().setOption({series:[]},true)
    fig.render()
    assert.equal(stable(chart.options.at(-1)),baseline,`no hidden ${name} change after explicit recovery`)
  }
  FakeChart.prototype.setOption.call(chart, {backgroundColor:'red'})
  assert.doesNotThrow(() => fig.dispose())
  assert.equal(h.window.resizeListeners.size,0)
})


test('stream ownership lost inside a generator stops once before appending and can be explicitly restarted', () => {
  const h=createBrowserHarness()
  const fig=new h.Figure(container(),{surfacePolicy:'transparent-auto-v1',animated:false}).plot([0,1],[2,3])
  fig.render();const chart=h.charts[0]!
  let generated=0
  const stop=fig.stream(()=>{
    generated++
    FakeChart.prototype.setOption.call(chart,{backgroundColor:'red'})
    return{x:2,y:4}
  },10,2)
  assert.throws(()=>h.timers.tick(),/live.*background/)
  assert.equal(generated,1);assert.equal(h.timers.active.size,0)
  assert.equal(h.timers.clearCalls.length,1)
  assert.doesNotThrow(()=>h.timers.tick());stop()
  assert.equal(h.timers.clearCalls.length,1)
  fig.getRawChart().setOption({series:[]},true);fig.render()
  assert.deepEqual(chart.options.at(-1).series[0].data,[[0,2],[1,3]])
  const restart=fig.stream(()=>({x:2,y:4}),10,3)
  h.timers.tick();assert.deepEqual(chart.options.at(-1).series[0].data,[[0,2],[1,3],[2,4]])
  restart();fig.dispose();assert.equal(h.timers.active.size,0)
})
