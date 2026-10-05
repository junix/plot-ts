import type { LineChart, ScatterChart } from '../svg/charts.js';
import { CANONICAL_THEME_NAMES, figure, type SvgFigureOptions } from '../svg/index.js';
import { fail, object, validateText } from './json.js';
type Axes = { axes: 'scaled-axes-v1'; yAxis?: true };
export type SupportedScaledChart = (LineChart & Axes) | (ScatterChart & Axes & { xAxis?: true });
export interface ScaledFigureInput { schema_version: 'plot-ts.svg-scaled-figure/v1'; figure?: SvgFigureOptions; charts: SupportedScaledChart[] }
const number = (v: unknown, p: string, min = -Infinity, max = Infinity, integer = false): number => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max || (integer && !Number.isInteger(v))) return fail('invalid_number', p);
  return v;
};
const text = (v: unknown, p: string): string => typeof v === 'string' ? validateText(v, p) : fail('expected_string', p);
const singleLine = (v: unknown, p: string, code: string): string => {
  const value = text(v, p);
  if ([...value].length > 128 || Buffer.byteLength(value) > 512 || !value.trim() || /[\t\r\n\u2028\u2029]/.test(value)) fail(code, p);
  return value;
};
const axis = (v: unknown, p: string): true => v === true ? true : fail('unsupported_value', p);
const disabled = (v: unknown, p: string): false => v === false ? false : fail('unsupported_value', p);
const enumeration = <T extends string>(v: unknown, values: readonly T[], p: string): T => typeof v === 'string' && values.includes(v as T) ? v as T : fail('unsupported_value', p);
const array = (v: unknown, p: string, max = 16384, min = 0): unknown[] => Array.isArray(v) && v.length <= max && v.length >= min ? v : fail('array_limit', p);
/** Structural/data budgets complete for the entire document before native rendering/log work. */
export function validateScaledInput(value: unknown): ScaledFigureInput {
  let scalars = 0;
  const dataNumber = (v: unknown, p: string) => { if (++scalars > 65536) fail('data_limit', p); return number(v, p); };
  const nullable = (v: unknown, p: string) => { if (v !== null) return dataNumber(v, p); if (++scalars > 65536) fail('data_limit', p); return null; };
  const root = object(value, ['schema_version', 'figure', 'charts'], ['schema_version', 'charts'], '$');
  if (root.schema_version !== 'plot-ts.svg-scaled-figure/v1') fail('unsupported_schema', '$.schema_version');
  const output: ScaledFigureInput = { schema_version: 'plot-ts.svg-scaled-figure/v1', charts: [] };
  if (Object.hasOwn(root, 'figure')) {
    const f = object(root.figure, ['width', 'height', 'title', 'theme', 'surfacePolicy', 'columns', 'gap'], [], '$.figure', ['accent', 'animated']);
    const o: SvgFigureOptions = {};
    for (const key of ['width', 'height'] as const) if (Object.hasOwn(f, key)) o[key] = number(f[key], `$.figure.${key}`, Number.MIN_VALUE, 8192);
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
    const type = object(raw, ['type', 'axes', 'x', 'series', 'points', 'yAxis', 'xAxis', 'labels', 'legend', 'unit', 'xUnit', 'xScale', 'yScale', 'xDomain', 'yDomain'], ['type'], p).type;
    if (type !== 'line' && type !== 'scatter') fail('unsupported_chart', `${p}.type`);
    const fields = ['type', 'axes', 'yAxis', 'unit', 'xUnit', 'xScale', 'yScale', 'xDomain', 'yDomain'];
    const c = object(raw, [...fields, ...(type === 'line' ? ['x', 'series', 'legend', 'labels'] : ['points', 'xAxis'])], ['type', 'axes', ...(type === 'line' ? ['x', 'series'] : ['points'])], p);
    const common: Axes & Pick<LineChart, 'unit' | 'xUnit' | 'xScale' | 'yScale' | 'xDomain' | 'yDomain'> = { axes: enumeration(c.axes, ['scaled-axes-v1'], `${p}.axes`) };
    if (Object.hasOwn(c, 'yAxis')) common.yAxis = axis(c.yAxis, `${p}.yAxis`);
    for (const key of ['unit', 'xUnit'] as const) if (Object.hasOwn(c, key)) common[key] = singleLine(c[key], `${p}.${key}`, 'invalid_unit');
    for (const key of ['xScale', 'yScale'] as const) if (Object.hasOwn(c, key)) common[key] = enumeration(c[key], ['linear', 'log10'], `${p}.${key}`);
    for (const key of ['xDomain', 'yDomain'] as const) if (Object.hasOwn(c, key)) {
      const domain = array(c[key], `${p}.${key}`, 2, 2);
      common[key] = [dataNumber(domain[0], `${p}.${key}[0]`), dataNumber(domain[1], `${p}.${key}[1]`)];
    }
    // Native exclusively validates positivity, domain containment/span and guide fit.
    if (type === 'line') {
      const values = array(c.x, `${p}.x`), series = array(c.series, `${p}.series`, 8, 1);
      if (values.length * series.length > 16384) fail('chart_data_limit', p);
      const chart: LineChart & Axes = { type, ...common, x: values.map((v, i) => dataNumber(v, `${p}.x[${i}]`)), series: [] };
      if (Object.hasOwn(c, 'legend')) chart.legend = enumeration(c.legend, ['series-names-v1'], `${p}.legend`);
      if (Object.hasOwn(c, 'labels')) chart.labels = disabled(c.labels, `${p}.labels`);
      chart.series = series.map((rawSeries, j) => {
        const sp = `${p}.series[${j}]`, s = object(rawSeries, ['y', 'area', 'smooth', 'name'], ['y'], sp);
        const data = array(s.y, `${sp}.y`);
        if (data.length !== values.length) fail('length_mismatch', sp);
        const result: LineChart['series'][number] = { y: data.map((v, k) => nullable(v, `${sp}.y[${k}]`)) };
        if (chart.legend) {
          if (!Object.hasOwn(s, 'name')) fail('missing_field', `${sp}.name`);
          result.name = singleLine(s.name, `${sp}.name`, 'invalid_series_name');
        } else if (Object.hasOwn(s, 'name')) fail('unsupported_option', `${sp}.name`);
        for (const key of ['area', 'smooth'] as const) if (Object.hasOwn(s, key)) result[key] = disabled(s[key], `${sp}.${key}`);
        return result;
      });
      if (chart.legend && new Set(chart.series.map(s => s.name)).size !== chart.series.length) fail('duplicate_series_name', `${p}.series`);
      output.charts.push(chart);
    } else {
      const chart: ScatterChart & Axes & { xAxis?: true } = { type: 'scatter', ...common, points: array(c.points, `${p}.points`).map((v, i) => {
        const pp = `${p}.points[${i}]`, pt = object(v, ['x', 'y', 'size'], ['x', 'y'], pp);
        const result: { x: number; y: number; size?: number } = { x: dataNumber(pt.x, `${pp}.x`), y: dataNumber(pt.y, `${pp}.y`) };
        if (Object.hasOwn(pt, 'size')) { result.size = dataNumber(pt.size, `${pp}.size`); number(result.size, `${pp}.size`, 0, 1024); }
        return result;
      }) };
      if (Object.hasOwn(c, 'xAxis')) chart.xAxis = axis(c.xAxis, `${p}.xAxis`);
      output.charts.push(chart);
    }
  });
  return output;
}
export function renderScaledInput(input: ScaledFigureInput): string {
  const f = figure(input.figure);
  for (const chart of input.charts) {
    if (chart.type === 'line') f.line(chart); else f.scatter(chart);
  }
  try { return f.render(); } catch { return fail('native_render_rejected'); }
}
