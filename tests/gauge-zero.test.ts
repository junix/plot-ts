import assert from 'node:assert/strict';
import test from 'node:test';
import { figure, type GaugeChart } from '../src/svg/index.js';

function render(config: Omit<GaugeChart, 'type'>, width = 800, height = 500): string {
  return figure({ width, height }).gauge(config).render();
}

function pointer(output: string): string {
  const points = output.match(/<polygon points="([^"]+)"/);
  assert.ok(points, 'gauge has a pointer');
  return points[1]!;
}

for (const value of [0, -0]) {
  test(`zero gauge (${Object.is(value, -0) ? '-0' : '0'}) uses the 0..1 auto domain`, () => {
    const output = render({ value });
    assert.doesNotMatch(output, /NaN|Infinity/);
    assert.equal(output, render({ value, max: 1 }));
    assert.equal(pointer(output), '400,342 396,355 294.83,426.41 404,355');
    assert.equal((output.match(/<path /g) ?? []).length, 3);
    assert.match(output, />0<\/text>/);
  });
}

test('zero gauge fallback scales with panel dimensions and preserves custom bands', () => {
  for (const [width, height] of [[160, 120], [500, 800], [640, 360]] as const) {
    const config = { value: 0, unit: '%', bands: [{ from: 0, to: 0.5, color: '#00A9F0' }, { from: 0.5, to: 1, color: '#051C2C' }] };
    const output = render(config, width, height);
    assert.doesNotMatch(output, /NaN|Infinity/);
    assert.equal(output, render({ ...config, max: 1 }, width, height));
    assert.match(output, />0%<\/text>/);
  }
});

test('explicit positive maxima remain authoritative and preserve endpoint clamping', () => {
  assert.equal(pointer(render({ value: -20, max: 100 })), pointer(render({ value: 0, max: 100 })));
  assert.equal(pointer(render({ value: 200, max: 100 })), pointer(render({ value: 100, max: 100 })));
  assert.equal(pointer(render({ value: 50, max: 100 })), '400,342 396,355 400,220 404,355');
  assert.notEqual(pointer(render({ value: 50, max: 100 })), pointer(render({ value: 50, max: 200 })));
  assert.match(render({ value: -20, max: 100 }), />-20<\/text>/);
});

test('ordinary positive automatic maxima keep their existing nice scale', () => {
  for (const [value, max] of [[0.1, 0.1], [7, 8], [28.7, 30], [100, 100]] as const) {
    assert.equal(render({ value }), render({ value, max }));
  }
});

for (const max of [0, -0, -1, NaN, Infinity, -Infinity]) {
  test(`invalid explicit gauge max ${String(max)} is rejected instead of inferred`, () => {
    for (const value of [0, 5]) {
      assert.throws(() => render({ value, max }), { name: 'RangeError', message: 'Gauge maximum must be finite and positive' });
    }
  });
}

for (const value of [NaN, Infinity, -Infinity]) {
  test(`nonfinite gauge value ${String(value)} is rejected locally`, () => {
    assert.throws(() => render({ value }), { name: 'RangeError', message: 'Gauge value must be finite' });
    assert.throws(() => render({ value, max: 100 }), { name: 'RangeError', message: 'Gauge value must be finite' });
  });
}

test('negative gauge values require an explicit positive maximum', () => {
  assert.throws(() => render({ value: -1 }), { name: 'RangeError', message: 'Gauge maximum must be finite and positive' });
  assert.doesNotMatch(render({ value: -1, max: 1 }), /NaN|Infinity/);
});

test('zero gauges compose and render deterministically without mutating their config', () => {
  const config = { value: 0, bands: [{ from: 0, to: 1, color: '#00A9F0' }] };
  const before = JSON.stringify(config);
  const fig = figure({ width: 640, height: 360 }).gauge(config).gauge({ value: 50, max: 100 });
  const output = fig.render();
  assert.doesNotMatch(output, /NaN|Infinity/);
  assert.equal((output.match(/<polygon /g) ?? []).length, 2);
  assert.equal(fig.render(), output);
  assert.equal(JSON.stringify(config), before);
});

test('an unrepresentable automatic nice maximum fails clearly instead of producing invalid geometry', () => {
  for (const value of [Number.MIN_VALUE, Number.MAX_VALUE]) {
    assert.throws(() => render({ value }), { name: 'RangeError', message: 'Gauge maximum must be finite and positive' });
  }
});
