import type { ColumnChart, LineChart, ScatterChart, SvgFigure } from '../../src/svg/index.js';

export const numericAxesColumn: ColumnChart = {
  type: 'column', axes: 'numeric-axes-v1', unit: 'tickets', legend: 'series-names-v1', labels: false,
  categories: ['W1', 'W2', 'W3'], series: [
    { name: 'Planned', values: [42, 50, 47] },
    { name: 'Completed', values: [38, 46, 49] },
  ],
};
export const numericAxesLine: LineChart = {
  type: 'line', axes: 'numeric-axes-v1', unit: '電圧（mV）', xUnit: '時間（秒）', legend: 'series-names-v1',
  x: [0, 0.1, 0.2, 0.3], series: [
    { name: '実測 & <A>', y: [1.2, 2.1, null, 1.6], area: true },
    { name: '予測', y: [1.1, 1.8, 1.5, 1.7] },
  ],
};
export const numericAxesScatter: ScatterChart = {
  type: 'scatter', axes: 'numeric-axes-v1', unit: 'mol/L', xUnit: 's',
  points: [{ x: 0.01, y: 0.00012 }, { x: 0.02, y: 0.00019 }, { x: 0.03, y: 0.00015 }],
};
export const numericAxesFixtures: Array<[string, (f: SvgFigure) => SvgFigure]> = [
  ['pm-grouped', f => f.bar(numericAxesColumn)],
  ['signed-stacked', f => f.bar({ ...numericAxesColumn, stacked: true, unit: 'accounts', categories: ['A', 'B'], series: [
    { name: 'Gains', values: [12, 8] }, { name: 'Losses', values: [-5, -11] },
  ] })],
  ['cjk-nullable-line-area', f => f.line(numericAxesLine)],
  ['scientific-scatter', f => f.scatter(numericAxesScatter)],
  ['large-radius-scatter', f => f.scatter({ ...numericAxesScatter, unit: 'value', xUnit: 'time', points: [
    { x: -2, y: -3, size: 30.01 }, { x: 0, y: 0, size: 4 }, { x: 2, y: 3, size: 30.01 },
  ] })],
  ['empty-column', f => f.bar({ axes: 'numeric-axes-v1', categories: [], series: [{ values: [] }], labels: false })],
];
