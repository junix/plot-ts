import type { Chart, SvgFigure } from '../../src/svg/index.js';
import {
  renderColumn, renderLine, renderScatter, renderHeatmap, renderWaterfall,
  renderDonut, renderRadar, renderGauge, renderSlope, renderPyramid,
} from '../../src/svg/charts.js';

type Method = 'bar' | Exclude<Chart['type'], 'column'>;

export interface PanelCase {
  name: string;
  type: Chart['type'];
  minWidth: number;
  minHeight: number;
  render: (width: number, height: number, empty?: boolean) => string;
  add: (figure: SvgFigure, empty?: boolean) => SvgFigure;
}

function sample<C extends Chart>(
  name: string, method: Method, config: C, empty: C,
  renderer: (config: C, width: number, height: number) => string,
  minWidth: number, minHeight: number,
): PanelCase {
  return {
    name, type: config.type, minWidth, minHeight,
    render: (width, height, isEmpty = false) => renderer(isEmpty ? empty : config, width, height),
    add: (figure, isEmpty = false) => {
      // Each tuple binds the method and configuration above; the union signature
      // would otherwise demand a configuration for all ten chart families.
      const add = figure[method] as (config: C) => SvgFigure;
      return add.call(figure, isEmpty ? empty : config);
    },
  };
}

export const panelCases: PanelCase[] = [
  ...[false, true].flatMap(yAxis => [false, true].map(labels => sample(
    `column-axis-${yAxis}-labels-${labels}`, 'bar',
    { type: 'column', categories: ['A', 'B'], series: [{ values: [2, 4] }], yAxis, labels },
    { type: 'column', categories: [], series: [], yAxis, labels }, renderColumn,
    yAxis ? 38 : 10, labels ? 46 : 32,
  ))),
  ...[false, true].map(yAxis => sample(`line-axis-${yAxis}`, 'line',
    { type: 'line', x: [0, 1], series: [{ y: [2, 4], area: true }], yAxis },
    { type: 'line', x: [], series: [], yAxis }, renderLine, yAxis ? 38 : 10, 46,
  )),
  ...[false, true].map(yAxis => sample(`scatter-axis-${yAxis}`, 'scatter',
    { type: 'scatter', points: [{ x: 0, y: 2 }, { x: 1, y: 4 }], yAxis },
    { type: 'scatter', points: [], yAxis }, renderScatter, yAxis ? 40 : 20, 34,
  )),
  sample('heatmap-unlabeled', 'heatmap',
    { type: 'heatmap', data: [[1, 2], [3, 4]] }, { type: 'heatmap', data: [] }, renderHeatmap, 20, 4),
  sample('heatmap-labels', 'heatmap',
    { type: 'heatmap', data: [[1, 2]], xLabels: ['A', 'B'], yLabels: ['Long label '.repeat(8)] },
    { type: 'heatmap', data: [[]], xLabels: [], yLabels: ['Long label '.repeat(8)] }, renderHeatmap, 20, 26),
  sample('waterfall', 'waterfall',
    { type: 'waterfall', categories: ['A', 'B'], values: [2, 4] },
    { type: 'waterfall', categories: [], values: [] }, renderWaterfall, 60, 60),
  sample('donut', 'donut',
    { type: 'donut', items: [{ name: 'A', value: 2 }, { name: 'B', value: 4 }] },
    { type: 'donut', items: [] }, renderDonut, 40, 40),
  sample('radar', 'radar',
    { type: 'radar', axes: [{ name: 'A' }, { name: 'B' }, { name: 'C' }], series: [{ values: [2, 4, 3] }] },
    { type: 'radar', axes: [], series: [] }, renderRadar, 80, 80),
  sample('gauge', 'gauge',
    { type: 'gauge', value: 2, max: 4 },
    { type: 'gauge', value: 0, max: 4, bands: [] }, renderGauge, 0, 0),
  sample('slope', 'slope',
    { type: 'slope', items: [{ name: 'A', left: 2, right: 4 }], leftTitle: 'Before', rightTitle: 'After' },
    { type: 'slope', items: [], leftTitle: 'Before', rightTitle: 'After' }, renderSlope, 160, 60),
  sample('pyramid', 'pyramid',
    { type: 'pyramid', layers: [{ name: 'A', value: 4 }, { name: 'B', value: 2 }] },
    { type: 'pyramid', layers: [] }, renderPyramid, 200, 20),
];
