import type { SvgFigure, SvgFigureOptions } from '../../src/svg/index.js';

export const motionFixtures: Array<[string, (figure: SvgFigure) => SvgFigure]> = [
  ['empty', f => f],
  ['column', f => f.bar({ categories: ['A', 'B', 'C'], series: [{ values: [10, -4, 0] }, { values: [4, null, 2] }] })],
  ['signed-stack', f => f.bar({ categories: ['A', 'B'], stacked: true, series: [{ values: [10, -7] }, { values: [-4, 3] }, { values: [3, -2] }, { values: [2, 0] }] })],
  ['scatter', f => f.scatter({ points: [{ x: -1, y: -2, size: 24 }, { x: 1, y: 2, size: 15.005 }, { x: 0, y: 0, size: 0 }, { x: NaN, y: 100 }] })],
  ['line', f => f.line({ x: [0, 1, 2], series: [{ y: [2, null, 5], area: true }] })],
  ['heatmap', f => f.heatmap({ data: [[1, 2], [3, 4]], xLabels: ['甲', '<two>'], yLabels: ['a', 'b'] })],
  ['waterfall', f => f.waterfall({ categories: ['A', 'B', 'C'], values: [5, -3, 6] })],
  ['donut', f => f.donut({ items: [{ name: 'A', value: 3 }, { name: 'B', value: 2 }] })],
  ['radar', f => f.radar({ axes: [{ name: 'A' }, { name: 'B' }, { name: 'C' }], series: [{ values: [4, 2, 5] }] })],
  ['gauge', f => f.gauge({ value: 42, max: 100, title: 'Gauge' })],
  ['slope', f => f.slope({ items: [{ name: 'A', left: 2, right: 5 }, { name: 'B', left: 6, right: 1 }] })],
  ['pyramid', f => f.pyramid({ layers: [{ name: 'A', value: 1 }, { name: 'B', value: 3 }] })],
  ['grid', f => f.bar({ categories: ['A', 'B'], stacked: true, series: [{ values: [6, -3] }, { values: [-4, 2] }] }).scatter({ points: [{ x: 0, y: 0, size: 30 }, { x: 1, y: 1, size: 30 }] })],
];

export const fixtureOptions: SvgFigureOptions = { width: 520, height: 320, title: 'Motion <&> 图', columns: 2 };
