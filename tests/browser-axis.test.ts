import assert from 'node:assert/strict';
import test from 'node:test';
import { createBrowserHarness } from './helpers/browser-figure.js';

// These tests exercise production Figure methods against a mocked ECharts sink.
// They verify generated options, not ECharts rendering or browser interaction.
type AxisName = 'xAxis' | 'yAxis';
const axes: AxisName[] = ['xAxis', 'yAxis'];

function setup() {
  const harness = createBrowserHarness();
  const fig = new harness.Figure({ style: {} } as HTMLElement);
  const chart = harness.charts[0]!;
  const option = () => chart.setOptionCalls.at(-1)!.option;
  return { fig, chart, option };
}

for (const axis of axes) {
  test(`${axis}: first call forwards all supported axis settings`, () => {
    const { fig, option } = setup();
    assert.equal(fig[axis]({ label: 'Distance', min: 1, max: 100, log: true, grid: true }), fig);
    fig.render();
    const output = option()[axis];
    assert.equal(output.name, 'Distance');
    assert.equal(output.min, 1);
    assert.equal(output.max, 100);
    assert.equal(output.type, 'log');
    assert.deepEqual(output.splitLine, { show: true });
  });

  test(`${axis}: later values override earlier values, including zero, false and empty text`, () => {
    const { fig, option } = setup();
    fig[axis]({ label: 'Old', min: 10, max: 100, log: true, grid: true });
    fig[axis]({ label: '', min: -5, max: 0, log: false, grid: false });
    fig.render();
    const output = option()[axis];
    assert.equal(output.name, '');
    assert.equal(output.min, -5);
    assert.equal(output.max, 0);
    assert.equal(output.type, 'value');
    assert.deepEqual(output.splitLine, { show: false });
    fig[axis]({ min: 0, max: 5 });
    fig.render();
    assert.equal(option()[axis].min, 0);
    assert.equal(option()[axis].max, 5);
  });

  test(`${axis}: label-only updates preserve existing bounds, log scale and grid`, () => {
    const { fig, option } = setup();
    fig[axis]({ label: 'Old', min: 1, max: 1000, log: true, grid: false });
    fig[axis]({ label: 'New' });
    fig.render();
    const output = option()[axis];
    assert.equal(output.name, 'New');
    assert.equal(output.min, 1);
    assert.equal(output.max, 1000);
    assert.equal(output.type, 'log');
    assert.deepEqual(output.splitLine, { show: false });
  });

  test(`${axis}: separate partial calls accumulate fields`, () => {
    const { fig, option } = setup();
    fig[axis]({ label: 'Values' });
    fig[axis]({ min: 1 });
    fig[axis]({ max: 100 });
    fig[axis]({ log: true });
    fig[axis]({ grid: true });
    fig.render();
    const output = option()[axis];
    assert.equal(output.name, 'Values');
    assert.equal(output.min, 1);
    assert.equal(output.max, 100);
    assert.equal(output.type, 'log');
    assert.deepEqual(output.splitLine, { show: true });
  });

  test(`${axis}: each explicitly supplied field can change independently`, () => {
    const { fig, option } = setup();
    fig[axis]({ label: 'First', min: 1, max: 10, log: true, grid: false });
    fig[axis]({ min: 2 });
    fig.render();
    assert.equal(option()[axis].min, 2);
    assert.equal(option()[axis].max, 10);
    fig[axis]({ max: 20 });
    fig.render();
    assert.equal(option()[axis].min, 2);
    assert.equal(option()[axis].max, 20);
    fig[axis]({ log: false });
    fig.render();
    assert.equal(option()[axis].type, 'value');
    assert.equal(option()[axis].min, 2);
    fig[axis]({ grid: true });
    fig.render();
    assert.deepEqual(option()[axis].splitLine, { show: true });
    assert.equal(option()[axis].name, 'First');
    fig[axis]({ label: 'Last' });
    fig.render();
    assert.equal(option()[axis].name, 'Last');
    assert.equal(option()[axis].max, 20);
  });

  test(`${axis}: an empty update is a no-op`, () => {
    const { fig, option } = setup();
    fig[axis]({ label: 'Log', min: 1, max: 100, log: true, grid: false });
    fig.render();
    const before = option()[axis];
    fig[axis]({});
    fig.render();
    assert.deepEqual(option()[axis], before);
  });

  test(`${axis}: changing settings after render reaches the next update payload`, () => {
    const { fig, chart, option } = setup();
    fig.plot([1, 2], [3, 4]);
    fig[axis]({ label: 'Before', min: 1, max: 4, grid: false });
    fig.render();
    const before = option();
    fig[axis]({ label: 'After', min: 0, max: 10, grid: true });
    fig.update();
    assert.equal(chart.setOptionCalls.length, 2);
    assert.equal(option()[axis].name, 'After');
    assert.equal(option()[axis].min, 0);
    assert.equal(option()[axis].max, 10);
    assert.deepEqual(option()[axis].splitLine, { show: true });
    assert.deepEqual(option().series, before.series);
    assert.equal(before[axis].name, 'Before');
    assert.equal(before[axis].min, 1);
    assert.deepEqual(before[axis].splitLine, { show: false });
  });

  test(`${axis}: caller configuration is not mutated`, () => {
    const { fig, option } = setup();
    const config = Object.freeze({ label: 'Frozen', min: 0, max: 5, log: false, grid: false });
    fig[axis](config);
    fig[axis]({ label: 'Changed', max: 10 });
    fig.render();
    assert.deepEqual(config, { label: 'Frozen', min: 0, max: 5, log: false, grid: false });
    assert.equal(option()[axis].name, 'Changed');
    assert.equal(option()[axis].max, 10);
  });

  test(`${axis}: omitted settings preserve numeric defaults`, () => {
    const { fig, option } = setup();
    fig[axis]({ label: 'Only a label' });
    fig.render();
    const output = option()[axis];
    assert.equal(output.type, 'value');
    assert.equal(output.min, undefined);
    assert.equal(output.max, undefined);
    assert.equal(output.splitLine, undefined);
    assert.deepEqual(output.axisLabel, { fontSize: 11 });
  });
}

test('axis settings remain independent from one another and the chart grid box', () => {
  const { fig, option } = setup();
  fig.grid(true);
  fig.xAxis({ label: 'X', min: 0, max: 5, grid: false });
  fig.yAxis({ label: 'Y', min: 10, max: 100, log: true, grid: true });
  fig.xAxis({ label: 'New X', max: 8 });
  fig.yAxis({ min: 20 });
  fig.render();
  const output = option();
  assert.equal(output.xAxis.name, 'New X');
  assert.equal(output.xAxis.min, 0);
  assert.equal(output.xAxis.max, 8);
  assert.equal(output.xAxis.type, 'value');
  assert.deepEqual(output.xAxis.splitLine, { show: false });
  assert.equal(output.yAxis.name, 'Y');
  assert.equal(output.yAxis.min, 20);
  assert.equal(output.yAxis.max, 100);
  assert.equal(output.yAxis.type, 'log');
  assert.deepEqual(output.yAxis.splitLine, { show: true });
  assert.equal(output.grid.show, true);
});

for (const chartType of ['bar', 'violin', 'heatmap'] as const) {
  for (const configureFirst of [false, true]) {
    test(`${chartType}: x-axis partial updates preserve categories (configure first=${configureFirst})`, () => {
      const { fig, option } = setup();
      if (configureFirst) fig.xAxis({ label: 'Before chart', min: 0, max: 1 });
      if (chartType === 'bar') fig.bar(['Alpha', 'Beta'], [4, 8]);
      else if (chartType === 'violin') fig.violin(['Alpha', 'Beta'], [[1, 2], [3, 4]]);
      else fig.heatmap([[1, 2], [3, 4]], ['Alpha', 'Beta'], ['First', 'Second']);
      fig.xAxis({ label: 'Before update' });
      fig.xAxis({ label: 'After update', grid: false });
      fig.render();
      assert.equal(option().xAxis.type, 'category');
      assert.deepEqual(option().xAxis.data, ['Alpha', 'Beta']);
      assert.equal(option().xAxis.name, 'After update');
      assert.deepEqual(option().xAxis.splitLine, { show: false });
      if (configureFirst) {
        assert.equal(option().xAxis.min, 0);
        assert.equal(option().xAxis.max, 1);
      }
    });
  }
}

for (const configureFirst of [false, true]) {
  test(`heatmap: y-axis labels and grids preserve category type (configure first=${configureFirst})`, () => {
    const { fig, option } = setup();
    if (configureFirst) fig.yAxis({ label: 'Before chart' });
    fig.heatmap([[1, 2], [3, 4]], ['Alpha', 'Beta'], ['First', 'Second']);
    fig.yAxis({ label: 'Before update' });
    fig.yAxis({ label: 'After update', grid: false });
    fig.render();
    assert.equal(option().yAxis.type, 'category');
    assert.equal(option().yAxis.name, 'After update');
    assert.deepEqual(option().yAxis.splitLine, { show: false });
  });
}

for (const chartType of ['plot', 'scatter', 'area'] as const) {
  test(`${chartType}: axis updates leave series data and visual options intact`, () => {
    const { fig, option } = setup();
    fig[chartType]([1, 2, 3], [4, 5, 6], { color: '#123456' });
    fig.render();
    const before = option();
    fig.xAxis({ label: 'Time', min: 0, max: 4 });
    fig.yAxis({ label: 'Values', min: 1, max: 10, log: true });
    fig.render();
    assert.deepEqual(option().series, before.series);
    assert.deepEqual(option().tooltip, before.tooltip);
    assert.deepEqual(option().title, before.title);
    assert.equal(option().xAxis.type, 'value');
    assert.equal(option().yAxis.type, 'log');
  });
}
