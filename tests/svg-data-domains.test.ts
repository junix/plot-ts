import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { figure, type Chart, type SvgFigure } from '../src/svg/index.js';
import { svg } from '../src/index.js';

type Method = 'bar' | Exclude<Chart['type'], 'column'>;
type Fixture = { name: string; method: Method; config: Chart; error?: string };
const cases = JSON.parse(readFileSync(new URL('./fixtures/svg-data-domain-cases.json', import.meta.url), 'utf8')) as Fixture[];
const golden = JSON.parse(readFileSync(new URL('./fixtures/svg-data-domain-golden.json', import.meta.url), 'utf8')) as Record<string, string>;
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const add = (f: SvgFigure, sample: Fixture) => (f[sample.method] as (c: Chart) => SvgFigure).call(f, sample.config);

for (const sample of cases) {
  test(`computed SVG data domain: ${sample.name}`, () => {
    const original = structuredClone(sample.config);
    for (const entry of [figure, svg.figure]) {
      const chart = add(entry({ width: 800, height: 500 }), sample);
      if (sample.error) {
        for (const render of [() => chart.render(), () => chart.renderHtml()]) {
          assert.throws(render, (error: unknown) => error instanceof RangeError && error.message.includes(sample.error!));
        }
        // One invalid panel fails the entire call rather than returning partial SVG.
        const grid = add(entry({ width: 1000, height: 500 }).heatmap({ data: [[1]] }), sample);
        assert.throws(() => grid.render(), RangeError);
      } else {
        const output = chart.render();
        assert.doesNotMatch(output, /NaN|Infinity|undefined/);
        assert.equal(sha(output), golden[sample.name]);
        assert.equal(chart.render(), output);
        assert.ok(chart.renderHtml().includes(output));
        assert.doesNotThrow(() => add(entry({ width: 1000, height: 500 }).heatmap({ data: [[1]] }), sample).render());
      }
    }
    assert.deepEqual(sample.config, original, 'rendering must not mutate input data');
  });
}

test('data-domain validation observes render-time mutation', () => {
  const x = [0, 1];
  const chart = figure().line({ x, series: [{ y: [1, 2] }] });
  assert.doesNotThrow(() => chart.render());
  x[0] = -1e308; x[1] = 1e308;
  assert.throws(() => chart.render(), /line x domain endpoints and span must be finite/);
  x[0] = 0; x[1] = 1;
  assert.doesNotThrow(() => chart.render());
});

test('inferred radar domains include visible values on explicit axes when another axis needs inference', () => {
  const chart = figure().radar({ axes: [{ name: 'A', max: Number.MAX_VALUE }, { name: 'B' }], series: [{ values: [Number.MAX_VALUE, 1] }] });
  assert.throws(() => chart.render(), /radar inferred maximum/);
});

test('stacked overflow fails even with a finite explicit maximum or cancelling signed layers', () => {
  for (const values of [[1e308, 1e308], [-1e308, -1e308], [1e308, -1e308, 1e308, -1e308]]) {
    assert.throws(() => figure().bar({ categories: ['A'], series: values.map(value => ({ values: [value] })), stacked: true, max: 1 }).render(), /column accumulated totals must be finite/);
  }
});

const witnesses = JSON.parse(readFileSync(new URL('./fixtures/svg-data-domain-before/manifest.json', import.meta.url), 'utf8')) as { base: string; records: Array<{ name: string; sha256: string }> };
for (const witness of witnesses.records) {
  test(`retained pre-change SVG witness: ${witness.name}`, () => {
    const old = readFileSync(new URL(`./fixtures/svg-data-domain-before/${witness.name}.svg`, import.meta.url), 'utf8');
    assert.equal(sha(old), witness.sha256);
    if (['line-x-span', 'column-stack-positive', 'waterfall-partial-overflow'].includes(witness.name)) assert.match(old, /NaN/);
    if (witness.name === 'heatmap-color-span') {
      const rects = [...old.matchAll(/<rect\b[^>]*>/g)].map(match => match[0]);
      assert.equal(rects.length, 2);
      assert.equal(rects.filter(rect => !/\bfill=/.test(rect)).length, 1);
    }
    const sample = cases.find(c => c.name === witness.name)!;
    assert.throws(() => add(figure({ width: 800, height: 500 }), sample).render(), RangeError);
  });
}
