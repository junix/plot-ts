import type { SvgFigure, ColumnChart, LineChart } from '../../src/svg/index.js';

export const columnLegend: ColumnChart = {
  type: 'column', categories: ['甲', '乙', '丙'], legend: 'series-names-v1', yAxis: true,
  series: [
    { name: '实测 & <A>', values: [9, -6, 3] },
    { name: '预测 "B"', values: [-4, 3, null] },
  ],
};
export const lineLegend: LineChart = {
  type: 'line', x: [0, 1, 2, 3, 4, 5], legend: 'series-names-v1', yAxis: true,
  series: [
    { name: '温度 & <实测>', y: [2, 5, null, -1, 3, 1], area: true },
    { name: '预测 "B"', y: [1, 3, 2, null, -2, 4] },
  ],
};
export const legendFixtureOptions = { width: 440, height: 290 };
export const legendFixtures: Array<[string, (figure: SvgFigure) => SvgFigure]> = [
  ['grouped-signed-cjk', f => f.bar(columnLegend)],
  ['stacked-signed-cjk', f => f.bar({ ...columnLegend, stacked: true })],
  ['nullable-line-area-cjk', f => f.line(lineLegend)],
  ['two-panel', f => f.bar(columnLegend).line(lineLegend)],
];

/** Baseline fixtures include supplied names but deliberately omit the opt-in. */
const unnamedColumn = { ...columnLegend }; delete unnamedColumn.legend;
const unnamedLine = { ...lineLegend }; delete unnamedLine.legend;
export const legacyNamedFixtures: Array<[string, (figure: SvgFigure) => SvgFigure]> = [
  ['grouped-signed-cjk', f => f.bar(unnamedColumn)],
  ['stacked-signed-cjk', f => f.bar({ ...unnamedColumn, stacked: true })],
  ['nullable-line-area-cjk', f => f.line(unnamedLine)],
  ['two-panel', f => f.bar(unnamedColumn).line(unnamedLine)],
];
