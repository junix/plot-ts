import assert from 'node:assert/strict'
import test from 'node:test'
import { createBrowserHarness } from './helpers/browser-figure.js'

function setup() {
  const harness = createBrowserHarness()
  const figure = new harness.Figure({ style: {} } as HTMLElement)
  return { ...harness, figure, chart: harness.charts[0]! }
}

test('dispose removes its resize listener and disposes ECharts only once', () => {
  const { figure, chart, window } = setup()
  const callback = [...window.resizeListeners][0]!
  assert.equal(window.resizeListeners.size, 1)
  window.dispatchResize()
  assert.equal(chart.resizeCalls, 1)

  figure.dispose()
  figure.dispose()
  assert.equal(window.resizeListeners.size, 0)
  assert.equal(chart.disposeCalls, 1)
  window.dispatchResize()
  callback() // Already captured callbacks must also become harmless.
  assert.equal(chart.resizeCalls, 1)
})

test('dispose cancels every active stream and suppresses stale timer callbacks', () => {
  const { figure, chart, timers } = setup()
  figure.plot([], [])
  let calls = 0
  const generator = () => ({ x: ++calls, y: 4 })
  const stopA = figure.stream(generator, 100)
  const stopB = figure.stream(generator, 250)
  assert.deepEqual([...timers.active.values()].map(timer => timer.interval), [100, 250])
  timers.tick()
  assert.equal(calls, 2)
  assert.equal(chart.setOptionCalls.length, 2)

  figure.dispose()
  figure.dispose()
  stopA()
  stopB()
  assert.equal(timers.active.size, 0)
  assert.equal(timers.clearCalls.length, 2)
  timers.tick()
  for (const callback of timers.callbacks.values()) callback()
  assert.equal(calls, 2)
  assert.equal(chart.setOptionCalls.length, 2)
  assert.equal(chart.disposeCalls, 1)
})

test('stopping one stream is idempotent and leaves another stream running', () => {
  const { figure, chart, timers } = setup()
  figure.plot([], [])
  let callsA = 0
  let callsB = 0
  const stopA = figure.stream(() => ({ x: ++callsA, y: 1 }))
  figure.stream(() => ({ x: ++callsB, y: 2 }))
  const callbackA = [...timers.callbacks.values()][0]!
  stopA()
  stopA()
  callbackA()
  timers.tick()
  assert.equal(callsA, 0)
  assert.equal(callsB, 1)
  assert.equal(chart.setOptionCalls.length, 1)
  assert.equal(timers.active.size, 1)
  assert.equal(timers.clearCalls.length, 1)
  figure.dispose()
  assert.equal(timers.clearCalls.length, 2)
})

test('disposing one figure leaves independent listeners and streams active', () => {
  const harness = createBrowserHarness()
  const first = new harness.Figure({ style: {} } as HTMLElement)
  const second = new harness.Figure({ style: {} } as HTMLElement)
  first.plot([], [])
  second.plot([], [])
  let firstCalls = 0
  let secondCalls = 0
  first.stream(() => ({ x: ++firstCalls, y: 1 }))
  second.stream(() => ({ x: ++secondCalls, y: 2 }))
  first.dispose()

  harness.window.dispatchResize()
  harness.timers.tick()
  assert.equal(harness.window.resizeListeners.size, 1)
  assert.equal(harness.timers.active.size, 1)
  assert.equal(firstCalls, 0)
  assert.equal(secondCalls, 1)
  assert.equal(harness.charts[0]!.resizeCalls, 0)
  assert.equal(harness.charts[0]!.setOptionCalls.length, 0)
  assert.equal(harness.charts[1]!.resizeCalls, 1)
  assert.equal(harness.charts[1]!.setOptionCalls.length, 1)
  assert.equal(harness.charts[1]!.disposeCalls, 0)

  second.dispose()
  assert.equal(harness.window.resizeListeners.size, 0)
  assert.equal(harness.timers.active.size, 0)
})

test('starting a stream after disposal does not create a timer or invoke its generator', () => {
  const { figure, chart, timers } = setup()
  figure.dispose()
  let calls = 0
  const stop = figure.stream(() => ({ x: ++calls, y: 1 }))
  stop()
  stop()
  timers.tick()
  assert.equal(timers.callbacks.size, 0)
  assert.equal(timers.clearCalls.length, 0)
  assert.equal(calls, 0)
  assert.equal(chart.setOptionCalls.length, 0)
})

test('a generator can dispose its figure without appending to the disposed chart', () => {
  const { figure, chart, timers } = setup()
  figure.plot([], [])
  let calls = 0
  figure.stream(() => {
    calls++
    figure.dispose()
    return { x: 1, y: 2 }
  })
  timers.tick()
  for (const callback of timers.callbacks.values()) callback()
  assert.equal(calls, 1)
  assert.equal(chart.disposeCalls, 1)
  assert.equal(chart.setOptionCalls.length, 0)
  assert.equal(timers.active.size, 0)
})

test('a generator can stop its own stream before appendPoint runs', () => {
  const { figure, chart, timers } = setup()
  figure.plot([], [])
  let calls = 0
  const stop = figure.stream(() => {
    calls++
    stop()
    return { x: 1, y: 2 }
  })
  timers.tick()
  for (const callback of timers.callbacks.values()) callback()
  assert.equal(calls, 1)
  assert.equal(chart.setOptionCalls.length, 0)
  assert.equal(timers.active.size, 0)
  assert.equal(timers.clearCalls.length, 1)
  figure.dispose()
})
