import assert from 'node:assert/strict';
import test from 'node:test';
import { figure, type ScatterChart } from '../src/svg/index.js';

function render(config: Omit<ScatterChart, 'type'>): string {
  return figure({ width: 300, height: 200 }).scatter(config).render();
}

function circles(output: string): Array<{ x: number; y: number; size: number }> {
  return [...output.matchAll(/<circle\b[^>]* cx="([^"]+)" cy="([^"]+)" r="([^"]+)"/g)]
    .map(match => ({ x: Number(match[1]), y: Number(match[2]), size: Number(match[3]) }));
}

function finiteOutput(output: string): void {
  assert.ok(!/NaN|Infinity/.test(output), 'all SVG geometry must be finite');
}

for (const yAxis of [false, true]) {
  for (const value of [-7, 0, 7]) {
    test(`singleton x=${value} is centered with yAxis=${yAxis}`, () => {
      const output = render({ points: [{ x: value, y: 2 }], yAxis });
      finiteOutput(output);
      assert.deepEqual(circles(output), [{ x: yAxis ? 160 : 150, y: 93, size: 4 }]);
    });
  }
}

for (const value of [-7, 0, 7]) {
  test(`constant x=${value} preserves the vertical distribution`, () => {
    const output = render({ points: [{ x: value, y: 10 }, { x: value, y: 20 }, { x: value, y: 30 }] });
    finiteOutput(output);
    assert.deepEqual(circles(output), [
      { x: 150, y: 176, size: 4 },
      { x: 150, y: 93, size: 4 },
      { x: 150, y: 10, size: 4 },
    ]);
  });
}

test('ordinary data preserves positions, marker sizes, and order', () => {
  const output = render({ points: [{ x: 0, y: 10, size: 2 }, { x: 1, y: 20 }, { x: 2, y: 30, size: 6 }] });
  finiteOutput(output);
  assert.deepEqual(circles(output), [
    { x: 10, y: 176, size: 2 },
    { x: 150, y: 93, size: 4 },
    { x: 290, y: 10, size: 6 },
  ]);
  assert.deepEqual([...output.matchAll(/<circle[^>]* style="([^"]+)"/g)].map(match => match[1]), ['--i:0', '--i:1', '--i:2']);
});

test('constant y remains finite and vertically centered', () => {
  const output = render({ points: [{ x: 0, y: 2 }, { x: 1, y: 2 }], yAxis: true });
  finiteOutput(output);
  assert.deepEqual(circles(output), [{ x: 30, y: 93, size: 4 }, { x: 290, y: 93, size: 4 }]);
});

test('non-finite coordinate pairs are omitted without widening either domain', () => {
  const output = render({
    points: [
      { x: 0, y: 10 },
      { x: NaN, y: 1e9 },
      { x: Infinity, y: -1e9 },
      { x: -Infinity, y: 0 },
      { x: 1e9, y: NaN },
      { x: -1e9, y: Infinity },
      { x: 1, y: -Infinity },
      { x: 2, y: 30 },
    ],
    yAxis: true,
  });
  finiteOutput(output);
  assert.deepEqual(circles(output), [{ x: 30, y: 176, size: 4 }, { x: 290, y: 10, size: 4 }]);
});

test('one finite pair amongst non-finite data is centered', () => {
  const output = render({ points: [{ x: NaN, y: 1e9 }, { x: 2, y: 2 }, { x: -1e9, y: NaN }], yAxis: true });
  finiteOutput(output);
  assert.deepEqual(circles(output), [{ x: 160, y: 93, size: 4 }]);
});

for (const points of [[], [{ x: NaN, y: 2 }], [{ x: 1, y: Infinity }, { x: -Infinity, y: 0 }]]) {
  test(`empty or wholly non-finite input renders finite axes: ${JSON.stringify(points)}`, () => {
    const output = render({ points, yAxis: true });
    finiteOutput(output);
    assert.deepEqual(circles(output), []);
  });
}
