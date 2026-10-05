import test from 'node:test';
import assert from 'node:assert/strict';
import { figure } from '../src/svg/index.js';
import { svg as rootSvg } from '../src/index.js';
import { renderLine, type LineChart } from '../src/svg/charts.js';

const axes = 'numeric-axes-v1' as const;
const size = { width: 500, height: 300 };
function inspect(svg: string) {
  const match = svg.match(/data-plot-axis="y" data-domain-min="([^"]+)" data-domain-max="([^"]+)"/);
  assert.ok(match);
  const yGuide = svg.slice(match.index!, svg.indexOf('data-plot-axis="x"', match.index));
  const ticks = [...yGuide.matchAll(/data-plot-tick-value="([^"]+)"[\s\S]*?<line[^>]*y1="([^"]+)"[\s\S]*?<text[^>]*>([^<]+)<\/text>/g)]
    .map(m => ({ value: Number(m[1]), y: Number(m[2]), label: m[3]! }));
  for (const tick of ticks) assert.equal(Number(tick.label.replaceAll(',', '')), tick.value);
  const paths = [...svg.matchAll(/<path d="([^"]+)" fill="none"/g)].map(m =>
    [...m[1]!.matchAll(/[ML]([\d.e+\-]+),([\d.e+\-]+)/g)].map(p => [Number(p[1]), Number(p[2])] as const));
  assert.ok(paths.length);
  return { domain: [Number(match[1]), Number(match[2])], ticks, paths };
}
const chart = (y: Array<number | null>, extra: Partial<LineChart> = {}): LineChart => ({ type: 'line', axes, x: y.map((_, i) => i), series: [{ y }], ...extra });
const render = (c: LineChart) => renderLine(c, size.width, size.height);

for (const [values, domain] of [
  [[0.001, 0.002], [0, 0.002]],
  [[1e-8, 2e-8], [0, 2e-8]],
  [[Number.MIN_VALUE, 2 * Number.MIN_VALUE], [0, 2 * Number.MIN_VALUE]],
  [[-0.002, -0.001], [-0.002, 0]],
  [[-2e-8, -1e-8], [-2e-8, 0]],
  [[-2 * Number.MIN_VALUE, -Number.MIN_VALUE], [-2 * Number.MIN_VALUE, 0]],
  [[-1e-8, 1e-8], [-1e-8, 1e-8]],
  [[-Number.MIN_VALUE, Number.MIN_VALUE], [-Number.MIN_VALUE, Number.MIN_VALUE]],
] as const) test(`small line ${values.join(',')} uses the actual scale for points and ticks`, () => {
  const result = inspect(render(chart([...values])));
  assert.deepEqual(result.domain, domain);
  const low = result.ticks[0]!, high = result.ticks.at(-1)!;
  assert.ok(low.y - high.y > 200);
  values.forEach((value, index) => {
    const expected = low.y - (value - domain[0]) / (domain[1] - domain[0]) * (low.y - high.y);
    assert.ok(Math.abs(result.paths[0]![index]![1] - expected) <= 0.011);
  });
  assert.ok(Math.abs(result.paths[0]![0]![1] - result.paths[0]![1]![1]) > 100, 'distinct observations must not serialize to one Y coordinate');
});

test('decimal unit rescaling preserves normalized positive and negative line geometry', () => {
  for (const sign of [-1, 1]) {
    const reference = inspect(render(chart([sign, 2 * sign]))).paths[0]!.map(p => p[1]);
    for (const magnitude of [1e-300, 1e-100, 1e-8, 0.001, 0.1, 1, 1e100, 1e300]) {
      const actual = inspect(render(chart([sign * magnitude, 2 * sign * magnitude]))).paths[0]!.map(p => p[1]);
      assert.deepEqual(actual, reference);
    }
  }
});

test('valid explicit fractional and zero upper bounds remain exact', () => {
  for (const [y, max, expected] of [
    [[0.001, 0.002], 0.003, [0, 0.003]], [[1e-8, 2e-8], 2e-8, [0, 2e-8]],
    [[Number.MIN_VALUE], Number.MIN_VALUE, [0, Number.MIN_VALUE]],
    [[-0.002, -0.001], 0, [-0.002, 0]], [[0, 0], 0, [0, 0]],
  ] as const) assert.deepEqual(inspect(render(chart([...y], { max }))).domain, expected);
  for (const max of [0, 0.001, -0.1, NaN, Infinity, -Infinity]) {
    const f = figure(size).line(chart([0.001, 0.002], { max }));
    for (const run of [() => f.render(), () => f.renderHtml(), () => f.renderFrame(0), () => f.renderFrame(1600), () => f.renderFrame(0, { reducedMotion: true })]) assert.throws(run, RangeError);
  }
});

test('constant, empty, all-zero, singleton and null-gap line domains remain finite', () => {
  for (const [y, expected] of [
    [[0.001, 0.001], [0, 0.001]], [[-0.001, -0.001], [-0.001, 0]],
    [[Number.MIN_VALUE], [0, Number.MIN_VALUE]], [[-Number.MIN_VALUE], [-Number.MIN_VALUE, 0]],
    [[0, -0], [0, 1]], [[0], [0, 1]],
  ] as const) assert.deepEqual(inspect(render(chart([...y]))).domain, expected);
  for (const y of [[], [null, null]]) {
    const svg = render(chart(y));
    assert.match(svg, /data-plot-axis="y" data-domain-min="0" data-domain-max="1"/);
    assert.doesNotMatch(svg, /NaN|Infinity|undefined|<path/);
  }
  const c = chart([0.001, null, 0.002]); c.series[0]!.area = true;
  const svg = render(c), result = inspect(svg);
  assert.equal(result.paths.length, 2); assert.deepEqual(result.domain, [0, 0.002]);
  assert.equal((svg.match(/ Z"/g) ?? []).length, 2);
});

test('small-value geometry is shared by direct, root, SVG, HTML and entry-frame surfaces', () => {
  const c = chart([1e-8, 2e-8]);
  const expected = render(c);
  for (const entry of [figure, rootSvg.figure]) {
    const f = entry(size).line(c);
    for (const output of [f.render(), f.renderHtml(), ...[0, 180, 1600, 0].map(t => f.renderFrame(t)), f.renderFrame(0, { reducedMotion: true })]) {
      assert.ok(output.includes(expected)); assert.deepEqual(inspect(output).domain, [0, 2e-8]);
    }
  }
});
