import assert from 'node:assert/strict';
import test from 'node:test';
import { figure } from '../src/svg/index.js';

function render(values: number[], labels = false): string {
  return figure({ width: 800, height: 500 }).waterfall({
    categories: values.map((_, i) => String.fromCharCode(65 + i)), values, labels,
  }).render();
}

function bars(output: string): Array<{ y: number; height: number }> {
  assert.doesNotMatch(output, /NaN|Infinity/, 'all geometry must be finite');
  return [...output.matchAll(/<rect\b([^>]*)\/>/g)].map(match => {
    const attributes = Object.fromEntries([...match[1]!.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1]!, m[2]!]));
    return { y: Number(attributes.y), height: Number(attributes.height) };
  });
}

for (const values of [[100, 100, -100], [-100, -100, 100], [20, -60, 100, -30], [50, -100, 100]]) {
  test(`waterfall domain contains every cumulative endpoint: ${values.join(', ')}`, () => {
    const rectangles = bars(render(values));
    assert.equal(rectangles.length, values.length);
    for (const rectangle of rectangles) {
      assert.ok(rectangle.y >= 30 - 0.01, `bar begins above plot: ${rectangle.y}`);
      assert.ok(rectangle.height >= 0, 'bar heights must be nonnegative');
      assert.ok(rectangle.y + rectangle.height <= 470 + 0.01, 'bar ends below plot');
    }
  });
}

test('a positive intermediate peak determines the shared waterfall scale', () => {
  assert.deepEqual(bars(render([100, 100, -100])), [
    { y: 250, height: 220 }, { y: 30, height: 220 }, { y: 30, height: 220 },
  ]);
});

test('a negative intermediate trough determines the shared waterfall scale', () => {
  assert.deepEqual(bars(render([-100, -100, 100])), [
    { y: 30, height: 220 }, { y: 250, height: 220 }, { y: 250, height: 220 },
  ]);
});

test('negative increments above zero do not create a spurious negative domain', () => {
  assert.deepEqual(bars(render([100, -10, -10])), [
    { y: 30, height: 440 }, { y: 30, height: 44 }, { y: 74, height: 44 },
  ]);
});

test('ordinary monotonic positive data keeps its geometry', () => {
  assert.deepEqual(bars(render([10, 20, 30])), [
    { y: 396.67, height: 73.33 }, { y: 250, height: 146.67 }, { y: 30, height: 220 },
  ]);
});

test('ordinary monotonic negative data keeps its geometry', () => {
  assert.deepEqual(bars(render([-10, -20, -30])), [
    { y: 30, height: 73.33 }, { y: 103.33, height: 146.67 }, { y: 250, height: 220 },
  ]);
});

test('empty, zero, and singleton waterfalls remain finite with labels enabled', () => {
  for (const values of [[], [0, 0, 0], [10], [-10]]) {
    assert.equal(bars(render(values, true)).length, values.length);
  }
});
