import assert from 'node:assert/strict';
import test from 'node:test';
import { figure } from '../src/svg/index.js';
import { renderDonut } from '../src/svg/charts.js';
import { seriesTone } from '../src/svg/context.js';

function paths(svg: string): string[] {
  return [...svg.matchAll(/<path d="([^"]+)"/g)].map(match => match[1]!);
}

test('one positive donut item draws a full ring with two arcs per boundary', () => {
  for (const value of [1, 7, 0.25]) {
    const svg = figure().donut({ items: [{ name: 'A', value }], labels: false }).render();
    assert.deepEqual(paths(svg), [
      'M400,20 A230,230 0 0,1 400,480 A230,230 0 0,1 400,20 Z M400,135 A115,115 0 0,0 400,365 A115,115 0 0,0 400,135 Z',
    ]);
    assert.doesNotMatch(svg, /NaN|Infinity|<text/);
  }
});

test('full-ring boundaries scale with the panel and requested hole ratio', () => {
  for (const [width, height] of [[160, 120], [500, 800], [640, 360]] as const) {
    for (const holeRatio of [0, 0.25, 0.5, 0.75]) {
      const cx = width / 2;
      const cy = height / 2;
      const r = Math.min(width, height) / 2 - 20;
      const holeR = r * holeRatio;
      const svg = renderDonut({ type: 'donut', items: [{ name: 'A', value: 1 }], holeRatio, labels: false }, width, height);
      assert.deepEqual(paths(svg), [
        `M${cx},${cy - r} A${r},${r} 0 0,1 ${cx},${cy + r} A${r},${r} 0 0,1 ${cx},${cy - r} Z M${cx},${cy - holeR} A${holeR},${holeR} 0 0,0 ${cx},${cy + holeR} A${holeR},${holeR} 0 0,0 ${cx},${cy - holeR} Z`,
      ]);
    }
  }
});

test('zero items on either side do not leave seams or change the positive item color', () => {
  for (const values of [[0, 1], [1, 0], [0, 1, 0], [0, 0, 1, 0], [0, 0, 0, 1]]) {
    const items = values.map((value, i) => ({ name: `item ${i}`, value }));
    const svg = figure().donut({ items, labels: false }).render();
    assert.equal(paths(svg).length, 1);
    assert.equal((paths(svg)[0]!.match(/ A/g) ?? []).length, 4);
    assert.doesNotMatch(paths(svg)[0]!, / L/);
    assert.ok(svg.includes(`fill="${seriesTone(values.indexOf(1)).color}"`));
    assert.doesNotMatch(svg, /<text/);
  }
});

test('default full-ring labels stay escaped and are drawn after the slice', () => {
  const svg = figure().donut({ items: [{ name: 'A<&', value: 1 }] }).render();
  assert.equal((svg.match(/<text /g) ?? []).length, 1);
  assert.ok(svg.includes('<text x="400" y="426.5"'));
  assert.ok(svg.includes('A&lt;&amp;</text>'));
  assert.ok(svg.indexOf('<text ') > svg.lastIndexOf('<path '));
});

test('empty and all-zero donut data intentionally produce no marks or labels', () => {
  for (const items of [[], [{ name: 'A', value: 0 }], [{ name: 'A', value: 0 }, { name: 'B', value: 0 }]]) {
    assert.equal(renderDonut({ type: 'donut', items }, 800, 500), '');
    const svg = figure().donut({ items }).render();
    assert.doesNotMatch(svg, /<path|<text|NaN|Infinity/);
  }
});

test('ordinary positive multi-slice paths and palette order remain unchanged', () => {
  const svg = figure().donut({
    items: [{ name: 'A', value: 1 }, { name: 'B', value: 2 }, { name: 'C', value: 3 }], labels: false,
  }).render();
  assert.deepEqual(paths(svg), [
    'M400,20 A230,230 0 0,1 599.19,135 L499.59,192.5 A115,115 0 0,0 400,135 Z',
    'M599.19,135 A230,230 0 0,1 400,480 L400,365 A115,115 0 0,0 499.59,192.5 Z',
    'M400,480 A230,230 0 0,1 400,20 L400,135 A115,115 0 0,0 400,365 Z',
  ]);
  assert.deepEqual([...svg.matchAll(/<path[^>]+ fill="([^"]+)"/g)].map(match => match[1]),
    [0, 1, 2].map(index => seriesTone(index).color));
});

test('zero items preserve the geometry, palette indices and labels of other slices', () => {
  const positive = [{ name: 'A', value: 1 }, { name: 'B', value: 2 }, { name: 'C', value: 3 }];
  const original = figure().donut({ items: positive }).render();
  const svg = figure().donut({ items: [positive[0]!, { name: 'zero', value: 0 }, ...positive.slice(1)] }).render();
  assert.deepEqual(paths(svg), paths(original));
  assert.deepEqual([...svg.matchAll(/<path[^>]+ fill="([^"]+)"/g)].map(match => match[1]),
    [0, 2, 3].map(index => seriesTone(index).color));
  assert.deepEqual(svg.match(/<text[^>]*>.*?<\/text>/g), original.match(/<text[^>]*>.*?<\/text>/g));
  assert.doesNotMatch(svg, />zero</);
});

test('single-slice donuts still compose with ordinary charts in insertion order', () => {
  const fig = figure({ width: 640, height: 360 })
    .donut({ items: [{ name: 'A', value: 1 }], labels: false })
    .donut({ items: [{ name: 'B', value: 1 }, { name: 'C', value: 2 }], labels: false });
  const svg = fig.render();
  assert.deepEqual([...svg.matchAll(/data-panel-index="(\d+)" data-chart-type="([^"]+)"/g)]
    .map(match => [match[1], match[2]]), [['0', 'donut'], ['1', 'donut']]);
  assert.equal(paths(svg).length, 3);
  assert.equal((paths(svg)[0]!.match(/ A/g) ?? []).length, 4);
  assert.equal(fig.render(), svg);
});
