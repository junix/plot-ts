import type { ColumnChart, LineChart, ScatterChart, HeatmapChart } from '../svg/charts.js';
import { CANONICAL_THEME_NAMES, figure, type SvgFigureOptions } from '../svg/index.js';
import { fail, object, validateText } from './json.js';
type Axes = { axes: 'numeric-axes-v1'; yAxis?: true };
export type SupportedChartV2 = (ColumnChart & Axes) | (LineChart & Axes) | (ScatterChart & Axes & { xAxis?: true }) | HeatmapChart;
export interface FigureInputV2 { schema_version: 'plot-ts.svg-figure/v2'; figure?: SvgFigureOptions; charts: SupportedChartV2[] }
const number = (v: unknown, p: string, min = -Infinity, max = Infinity, integer = false): number => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max || (integer && !Number.isInteger(v))) return fail('invalid_number', p);
  return v;
};
const text = (v: unknown, p: string): string => typeof v === 'string' ? validateText(v, p) : fail('expected_string', p);
const unit = (v: unknown, p: string): string => {
  const value = text(v, p);
  if ([...value].length > 128 || Buffer.byteLength(value) > 512 || !value.trim() || /[\t\r\n\u2028\u2029]/.test(value)) fail('invalid_unit', p);
  return value;
};
const axis = (v: unknown, p: string): true => v === true ? true : fail('unsupported_value', p);
const bool = (v: unknown, p: string): boolean => typeof v === 'boolean' ? v : fail('expected_boolean', p);
const enumeration = <T extends string>(v: unknown, values: readonly T[], p: string): T => typeof v === 'string' && values.includes(v as T) ? v as T : fail('unsupported_value', p);
const array = (v: unknown, p: string, max = 16384, min = 0): unknown[] => Array.isArray(v) && v.length <= max && v.length >= min ? v : fail('array_limit', p);
export function validateInputV2(value: unknown): FigureInputV2 {
  let scalars = 0;
  const dataNumber = (v: unknown, p: string) => { if (++scalars > 65536) fail('data_limit', p); return number(v, p); };
  const nullable = (v: unknown, p: string) => v === null ? null : dataNumber(v, p);
  const root = object(value, ['schema_version', 'figure', 'charts'], ['schema_version', 'charts'], '$');
  if (root.schema_version !== 'plot-ts.svg-figure/v2') fail('unsupported_schema', '$.schema_version');
  const output: FigureInputV2 = { schema_version: 'plot-ts.svg-figure/v2', charts: [] };
  if (Object.hasOwn(root, 'figure')) {
    const f = object(root.figure, ['width', 'height', 'title', 'theme', 'surfacePolicy', 'columns', 'gap'], [], '$.figure', ['accent', 'animated']);
    const o: SvgFigureOptions = {};
    for (const key of ['width', 'height'] as const) if (Object.hasOwn(f, key)) { o[key] = number(f[key], `$.figure.${key}`, Number.MIN_VALUE, 8192); }
    if (Object.hasOwn(f, 'title')) o.title = text(f.title, '$.figure.title');
    if (Object.hasOwn(f, 'theme')) o.theme = enumeration(f.theme, CANONICAL_THEME_NAMES, '$.figure.theme');
    if (Object.hasOwn(f, 'surfacePolicy')) o.surfacePolicy = enumeration(f.surfacePolicy, ['themed-v1', 'transparent-root-v1', 'transparent-auto-v1'], '$.figure.surfacePolicy');
    if (Object.hasOwn(f, 'columns')) o.columns = number(f.columns, '$.figure.columns', 1, 16, true);
    if (Object.hasOwn(f, 'gap')) o.gap = number(f.gap, '$.figure.gap', 0, 1024);
    output.figure = o;
  }
  const charts = array(root.charts, '$.charts', 16, 1);
  charts.forEach((raw, index) => {
    const p = `$.charts[${index}]`;
    const type = object(raw, ['type', 'categories', 'series', 'stacked', 'yAxis', 'labels', 'max', 'format', 'precision', 'legend', 'x', 'points', 'data', 'xLabels', 'yLabels', 'colormap', 'axes', 'unit', 'xUnit', 'xAxis', 'smooth'], ['type'], p).type;
    if (type === 'column' || type === 'line') {
      const c = object(raw, type === 'column' ? ['type', 'axes', 'categories', 'series', 'stacked', 'yAxis', 'labels', 'max', 'format', 'precision', 'legend', 'unit'] : ['type', 'axes', 'x', 'series', 'yAxis', 'max', 'legend', 'unit', 'xUnit'], ['type', 'axes', type === 'column' ? 'categories' : 'x', 'series'], p, type === 'column' ? [] : ['labels']);
      const legend = Object.hasOwn(c, 'legend') ? enumeration(c.legend, ['series-names-v1'], `${p}.legend`) : undefined;
      const values = array(type === 'column' ? c.categories : c.x, `${p}.${type === 'column' ? 'categories' : 'x'}`);
      const series = array(c.series, `${p}.series`, 8, 1);
      if (values.length * series.length > 16384) fail('chart_data_limit', p);
      const common: { axes: 'numeric-axes-v1'; yAxis?: true; max?: number; legend?: 'series-names-v1'; unit?: string } = { axes: enumeration(c.axes, ['numeric-axes-v1'], `${p}.axes`) };
      if (Object.hasOwn(c, 'unit')) common.unit = unit(c.unit, `${p}.unit`);
      if (Object.hasOwn(c, 'yAxis')) common.yAxis = axis(c.yAxis, `${p}.yAxis`);
      if (Object.hasOwn(c, 'max')) common.max = number(c.max, `${p}.max`);
      if (legend) common.legend = legend;
      const parsed = series.map((rawSeries, j) => {
        const sp = `${p}.series[${j}]`;
        const key = type === 'column' ? 'values' : 'y';
        const s = object(rawSeries, type === 'column' ? ['values', 'name'] : ['y', 'area', 'name'], [key], sp, type === 'line' ? ['smooth'] : []);
        const data = array(s[key], `${sp}.${key}`);
        if (data.length !== values.length) fail('length_mismatch', sp);
        const result: { data: (number | null)[]; name?: string; area?: boolean } = { data: data.map((v, k) => nullable(v, `${sp}.${key}[${k}]`)) };
        if (legend) {
          if (!Object.hasOwn(s, 'name')) fail('missing_field', `${sp}.name`);
          result.name = text(s.name, `${sp}.name`);
          if ([...result.name].length > 128 || Buffer.byteLength(result.name) > 512 || !result.name.trim() || /[\t\r\n\u2028\u2029]/.test(result.name)) fail('invalid_series_name', `${sp}.name`);
        } else if (Object.hasOwn(s, 'name')) fail('unsupported_option', `${sp}.name`);
        if (Object.hasOwn(s, 'area')) result.area = bool(s.area, `${sp}.area`);
        return result;
      });
      if (legend && new Set(parsed.map(s => s.name)).size !== parsed.length) fail('duplicate_series_name', `${p}.series`);
      if (type === 'column') {
        const chart: ColumnChart & Axes = { type, ...common, categories: values.map((v, k) => text(v, `${p}.categories[${k}]`)), series: parsed.map(s => ({ values: s.data, ...(s.name === undefined ? {} : { name: s.name }) })) };
        for (const key of ['stacked', 'labels'] as const) if (Object.hasOwn(c, key)) chart[key] = bool(c[key], `${p}.${key}`);
        if (Object.hasOwn(c, 'format')) chart.format = enumeration(c.format, ['plain', 'percent', 'compact'], `${p}.format`);
        if (Object.hasOwn(c, 'precision')) chart.precision = number(c.precision, `${p}.precision`, 0, 12, true);
        output.charts.push(chart);
      } else {
        output.charts.push({ type, ...common, ...(Object.hasOwn(c, 'xUnit') ? { xUnit: unit(c.xUnit, `${p}.xUnit`) } : {}), x: values.map((v, k) => dataNumber(v, `${p}.x[${k}]`)), series: parsed.map(s => ({ y: s.data, ...(s.name === undefined ? {} : { name: s.name }), ...(s.area === undefined ? {} : { area: s.area }) })) });
      }
    } else if (type === 'scatter') {
      const c = object(raw, ['type', 'axes', 'points', 'yAxis', 'xAxis', 'unit', 'xUnit'], ['type', 'axes', 'points'], p);
      const chart: ScatterChart & Axes & { xAxis?: true } = { type, axes: enumeration(c.axes, ['numeric-axes-v1'], `${p}.axes`), points: array(c.points, `${p}.points`).map((v, i) => {
        const pp = `${p}.points[${i}]`, pt = object(v, ['x', 'y', 'size'], ['x', 'y'], pp);
        const result: { x: number; y: number; size?: number } = { x: dataNumber(pt.x, `${pp}.x`), y: dataNumber(pt.y, `${pp}.y`) };
        if (Object.hasOwn(pt, 'size')) { result.size = dataNumber(pt.size, `${pp}.size`); number(result.size, `${pp}.size`, 0, 1024); }
        return result;
      }) };
      if (Object.hasOwn(c, 'yAxis')) chart.yAxis = axis(c.yAxis, `${p}.yAxis`);
      if (Object.hasOwn(c, 'xAxis')) chart.xAxis = axis(c.xAxis, `${p}.xAxis`);
      for (const key of ['unit', 'xUnit'] as const) if (Object.hasOwn(c, key)) chart[key] = unit(c[key], `${p}.${key}`);
      output.charts.push(chart);
    } else if (type === 'heatmap') {
      const c = object(raw, ['type', 'data', 'xLabels', 'yLabels', 'colormap'], ['type', 'data'], p);
      const rows = array(c.data, `${p}.data`, 1024);
      let width = 0;
      const data = rows.map((r, i) => {
        const row = array(r, `${p}.data[${i}]`, 1024, 1);
        if (i === 0) { width = row.length; if (width * rows.length > 16384) fail('chart_data_limit', p); }
        if (width !== row.length) fail('ragged_data', p);
        return row.map((v, j) => dataNumber(v, `${p}.data[${i}][${j}]`));
      });
      const chart: HeatmapChart = { type, data };
      for (const key of ['xLabels', 'yLabels'] as const) if (Object.hasOwn(c, key)) chart[key] = array(c[key], `${p}.${key}`, key === 'xLabels' ? width : rows.length).map((v, i) => text(v, `${p}.${key}[${i}]`));
      if (Object.hasOwn(c, 'colormap')) chart.colormap = enumeration(c.colormap, ['viridis', 'plasma', 'blues'], `${p}.colormap`);
      output.charts.push(chart);
    } else fail('unsupported_chart', `${p}.type`);
  });
  return output;
}
export function renderInputV2(input: FigureInputV2): string {
  const f = figure(input.figure);
  for (const chart of input.charts) {
    switch (chart.type) {
      case 'column': f.bar(chart); break;
      case 'line': f.line(chart); break;
      case 'scatter': f.scatter(chart); break;
      case 'heatmap': f.heatmap(chart); break;
    }
  }
  try { return f.render(); } catch { return fail('native_render_rejected'); }
}
