import assert from 'node:assert/strict';
import test from 'node:test';
import { figure, type PyramidChart } from '../src/svg/index.js';

function render(layers: PyramidChart['layers'], width = 800, height = 500): string {
  return figure({ width, height }).pyramid({ layers }).render();
}

function rectangles(output: string): Array<Record<string, string>> {
  return [...output.matchAll(/<rect\b([^>]*)>/g)].map(match => Object.fromEntries(
    [...match[1]!.matchAll(/([\w-]+)="([^"]*)"/g)].map(attribute => [attribute[1]!, attribute[2]!]),
  ));
}

for (const count of [1, 2, 4]) {
  test(`${count} all-zero pyramid layers retain finite centered zero-width marks and labels`, () => {
    const output = render(Array.from({ length: count }, (_, i) => ({ name: `layer ${i}`, value: i % 2 ? -0 : 0 })));
    assert.doesNotMatch(output, /NaN|Infinity/);
    const rects = rectangles(output);
    assert.equal(rects.length, count);
    rects.forEach((rect, i) => {
      assert.equal(rect.x, '400');
      assert.equal(rect.width, '0');
      assert.equal(Number(rect.y), 10 + i * 480 / count);
      assert.equal(Number(rect.height), 480 / count * 0.85);
      assert.match(output, new RegExp(`>layer ${i}</text>`));
    });
    assert.equal((output.match(/>0<\/text>/g) ?? []).length, count);
    assert.equal((output.match(/<text x="392"/g) ?? []).length, count);
    assert.equal((output.match(/<text x="408"/g) ?? []).length, count);
  });
}

test('zero pyramid layers remain centered across panel sizes and escaped labels survive', () => {
  for (const [width, height] of [[160, 120], [500, 800], [640, 360]] as const) {
    const output = render([{ name: 'A<&', value: 0 }], width, height);
    assert.doesNotMatch(output, /NaN|Infinity/);
    const rect = rectangles(output)[0]!;
    // Below 200px, fixed insets collapse the plot width to zero at x=100.
    assert.equal(Number(rect.x), 100 + Math.max(0, width - 200) / 2);
    assert.equal(rect.width, '0');
    assert.match(output, />A&lt;&amp;<\/text>/);
  }
});

test('zero layers alongside positive layers preserve geometry and series-color order', () => {
  const output = render([{ name: 'zero', value: 0 }, { name: 'positive', value: 1 }]);
  assert.deepEqual(rectangles(output), [
    { x: '400', y: '10', width: '0', height: '204', fill: '#051C2C' },
    { x: '100', y: '250', width: '600', height: '204', fill: '#00A9F0' },
  ]);
});

test('ordinary positive pyramid widths keep the existing shared nice maximum', () => {
  assert.deepEqual(rectangles(render([{ name: 'A', value: 5 }, { name: 'B', value: 10 }, { name: 'C', value: 20 }])), [
    { x: '325', y: '10', width: '150', height: '136', fill: '#051C2C' },
    { x: '250', y: '170', width: '300', height: '136', fill: '#00A9F0' },
    { x: '100', y: '330', width: '600', height: '136', fill: '#E6E8EA' },
  ]);
  assert.equal(rectangles(render([{ name: 'fraction', value: 0.07 }]))[0]!.width, '525');
});

test('empty pyramid still produces no marks or labels', () => {
  const output = render([]);
  assert.doesNotMatch(output, /<rect|<text|NaN|Infinity/);
});

for (const value of [-1, NaN, Infinity, -Infinity]) {
  test(`invalid pyramid value ${String(value)} is rejected locally`, () => {
    for (const layers of [[{ name: 'invalid', value }], [{ name: 'valid', value: 1 }, { name: 'invalid', value }]]) {
      assert.throws(() => render(layers), { name: 'RangeError', message: 'Pyramid values must be finite and non-negative' });
    }
  });
}

test('zero pyramids compose and render deterministically without mutating layers', () => {
  const layers = [{ name: 'A', value: 0 }, { name: 'B', value: 0 }];
  const before = JSON.stringify(layers);
  const fig = figure({ width: 640, height: 360 }).pyramid({ layers }).pyramid({ layers: [{ name: 'C', value: 1 }] });
  const output = fig.render();
  assert.doesNotMatch(output, /NaN|Infinity/);
  assert.equal(rectangles(output).length, 3);
  assert.equal(fig.render(), output);
  assert.equal(JSON.stringify(layers), before);
});

test('an unrepresentable automatic nice maximum fails clearly instead of producing invalid geometry', () => {
  for (const value of [Number.MIN_VALUE, Number.MAX_VALUE]) {
    assert.throws(() => render([{ name: 'extreme', value }]), { name: 'RangeError', message: 'Pyramid maximum must be finite and positive' });
  }
});
