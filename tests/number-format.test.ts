import assert from 'node:assert/strict';
import test from 'node:test';
import { fmt, type NumberFormat } from '../src/util/scale.js';
import { figure } from '../src/svg/index.js';

const defaultCases: Array<[number, NumberFormat, string]> = [
  [0, 'currency', '$0'],
  [10, 'currency', '$10'],
  [100, 'currency', '$100'],
  [1000, 'currency', '$1,000'],
  [1200000, 'currency', '$1,200,000'],
  [-10, 'currency', '$-10'],
  [-1000, 'currency', '$-1,000'],
  [10.4, 'currency', '$10'],
  [99.6, 'currency', '$100'],
  [0, 'compact', '0'],
  [10, 'compact', '10'],
  [100, 'compact', '100'],
  [-10, 'compact', '-10'],
  [-100, 'compact', '-100'],
  [10.4, 'compact', '10'],
  [99.6, 'compact', '100'],
  [999.6, 'compact', '1000'],
  [1000, 'compact', '1K'],
  [10000, 'compact', '10K'],
  [12500, 'compact', '12.5K'],
  [1000000, 'compact', '1M'],
  [10000000000, 'compact', '10B'],
  [-12500, 'compact', '-12.5K'],
  [0, 'plain', '0'],
  [10, 'plain', '10'],
  [1000, 'plain', '1,000'],
  [3.5, 'plain', '3.5'],
  [0, 'percent', '0%'],
  [10, 'percent', '10%'],
  [3.5, 'percent', '3.5%'],
  [1.2e30, 'currency', '$1.2e+30'],
  [-1.2e30, 'currency', '$-1.2e+30'],
  [1.2e30, 'plain', '1.2e+30'],
  [-1.2e30, 'plain', '-1.2e+30'],
  [1.2e30, 'percent', '1.2e+30%'],
  [-1.2e30, 'percent', '-1.2e+30%'],
  [1.5e39, 'compact', '1.5e+30B'],
  [-1.5e39, 'compact', '-1.5e+30B'],
];

for (const [value, kind, expected] of defaultCases) {
  test(`fmt(${value}, ${kind}) preserves significant zeros`, () => {
    assert.equal(fmt(value, kind), expected);
  });
}

const precisionCases: Array<[number, NumberFormat, number, string]> = [
  [0, 'currency', 0, '$0'],
  [10, 'currency', 0, '$10'],
  [1000, 'currency', 2, '$1,000.00'],
  [3.5, 'currency', 2, '$3.50'],
  [10, 'compact', 0, '10'],
  [10, 'compact', 2, '10.00'],
  [10000, 'compact', 2, '10.00K'],
  [1000, 'plain', 2, '1,000.00'],
  [3.5, 'plain', 2, '3.50'],
  [10, 'percent', 2, '10.00%'],
];

for (const [value, kind, precision, expected] of precisionCases) {
  test(`fmt(${value}, ${kind}, ${precision}) retains explicit precision`, () => {
    assert.equal(fmt(value, kind, precision), expected);
  });
}

test('null and non-finite values stay empty in every format', () => {
  for (const kind of ['plain', 'percent', 'compact', 'currency'] as const) {
    for (const value of [null, NaN, Infinity, -Infinity]) {
      assert.equal(fmt(value, kind), '');
    }
  }
});

test('compact SVG data labels retain integer zeros', () => {
  const output = figure().bar({
    categories: ['A', 'B'],
    series: [{ values: [100, 200] }],
    format: 'compact',
  }).render();

  assert.ok(output.includes('>100</text>'));
  assert.ok(output.includes('>200</text>'));
});
