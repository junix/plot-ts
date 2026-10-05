import type { FigureInputV2, SupportedChartV2 } from './input-v2.js';
import type { RenderReceipt } from './receipt.js';
import { REGISTRY_SHA256 } from './receipt.js';
import { runtimeEvidence } from './runtime.js';
import { fail, parseJson } from './json.js';
import { sha256 } from './io.js';
import { schemaCheck } from './schema-check.js';
import schema from './render-receipt-v2.schema.json' with { type: 'json' };
type LimitationV2 = 'system-fonts-unmeasured' | 'numeric-axes-fit-approximate' | 'numeric-axes-interior-ticks-fit-dependent' | 'binary64-and-svg-coordinate-rounding' | 'heatmap-label-fit-approximate-with-full-title' | 'order-color-series-without-legend' | 'column-category-label-fit-unmeasured' | 'column-value-labels-rounded-and-height-conditional';
type NumericPanel = { panel_index: number; profile: 'numeric-axes-v1' } & (
  { chart_type: 'column'; axes: 'y'; unit_axes: ('y')[] } |
  { chart_type: 'line' | 'scatter'; axes: 'xy'; unit_axes: ('y' | 'x')[] }
);
export interface RenderReceiptV2 extends Omit<RenderReceipt, 'schema_version' | 'profile' | 'input_schema' | 'figure' | 'limitations'> {
  schema_version: 'plot-ts.render-receipt/v2'; profile: 'plot-ts-svg-static-numeric-axes/1'; input_schema: 'plot-ts.svg-figure/v2';
  figure: RenderReceipt['figure'] & { numeric_axes_panels: NumericPanel[] };
  limitations: { panel_index: number; chart_type: SupportedChartV2['type']; code: LimitationV2 }[];
}
/** Requested-and-validated metadata only. Native rendering exclusively owns domains and geometry. */
function receiptValue(input: FigureInputV2, raw: Buffer, svg: Buffer, version: string): RenderReceiptV2 {
  const options = input.figure ?? {};
  const receipt: RenderReceiptV2 = {
    schema_version: 'plot-ts.render-receipt/v2', provider: { id: 'plot-provider-plot-ts', version }, profile: 'plot-ts-svg-static-numeric-axes/1', input_schema: input.schema_version,
    artifact_receipt: { schema_version: 'plot.artifact-receipt-core/v1', inputs: [{ role: 'input', sha256: sha256(raw), bytes: raw.length }], primary: { artifact_id: 'figure', role: 'primary', argument: 'output', kind: 'svg', sha256: sha256(svg), bytes: svg.length } },
    figure: { width: options.width ?? 800, height: options.height ?? 500, columns: Math.min(options.columns ?? Math.ceil(Math.sqrt(input.charts.length)), input.charts.length), gap: options.gap ?? 16, chart_types: input.charts.map(c => c.type), legend_panels: [], numeric_axes_panels: [] },
    theme: options.theme === undefined ? { mode: 'legacy' } : { mode: 'canonical', name: options.theme, registry_sha256: REGISTRY_SHA256 },
    surface: { schema_version: 'plot.surface-policy/v1', policy: options.surfacePolicy ?? 'themed-v1' }, rendering: { mode: 'static' }, runtime: runtimeEvidence(), limitations: [],
  };
  input.charts.forEach((chart, panel_index) => {
    const add = (code: LimitationV2) => receipt.limitations.push({ panel_index, chart_type: chart.type, code });
    add('system-fonts-unmeasured');
    if (chart.type === 'heatmap') { add('heatmap-label-fit-approximate-with-full-title'); return; }
    add('numeric-axes-fit-approximate');
    add('numeric-axes-interior-ticks-fit-dependent');
    add('binary64-and-svg-coordinate-rounding');
    if (chart.type === 'column') {
      receipt.figure.numeric_axes_panels.push({ panel_index, chart_type: chart.type, profile: chart.axes, axes: 'y', unit_axes: chart.unit === undefined ? [] : ['y'] });
    } else {
      const unit_axes: ('y' | 'x')[] = [];
      if (chart.unit !== undefined) unit_axes.push('y');
      if (chart.xUnit !== undefined) unit_axes.push('x');
      receipt.figure.numeric_axes_panels.push({ panel_index, chart_type: chart.type, profile: chart.axes, axes: 'xy', unit_axes });
    }
    if (chart.type === 'column' || chart.type === 'line') {
      if (chart.legend) receipt.figure.legend_panels.push({ panel_index, profile: chart.legend });
      else add('order-color-series-without-legend');
    }
    if (chart.type === 'column') {
      add('column-category-label-fit-unmeasured');
      if (chart.labels !== false) add('column-value-labels-rounded-and-height-conditional');
    }
  });
  return receipt;
}
/** Object key order is irrelevant; array order and every scalar remain exact. */
function equal(value: unknown, expected: unknown): boolean {
  if (value === expected) return true;
  if (Array.isArray(expected)) return Array.isArray(value) && value.length === expected.length && expected.every((v, i) => equal(value[i], v));
  if (!expected || typeof expected !== 'object' || !value || typeof value !== 'object' || Array.isArray(value)) return false;
  const a = value as Record<string, unknown>, b = expected as Record<string, unknown>;
  return Object.keys(a).length === Object.keys(b).length && Object.keys(b).every(k => Object.hasOwn(a, k) && equal(a[k], b[k]));
}
export function validateReceiptV2(value: unknown, input: FigureInputV2, raw: Buffer, svg: Buffer, version: string): void {
  schemaCheck(value, schema);
  // Full comparison enforces complete ordered panel coverage, chart/profile and unit
  // correspondence, legends, limitation order, resolved options and actual byte bindings.
  // It never reconstructs native ticks, domains, layout or omitted-label counts.
  if (!equal(value, receiptValue(input, raw, svg, version))) fail('receipt_invalid');
}
export function makeReceiptV2(input: FigureInputV2, raw: Buffer, svg: Buffer, version: string): Buffer {
  const bytes = Buffer.from(JSON.stringify(receiptValue(input, raw, svg, version)) + '\n');
  validateReceiptV2(parseJson(bytes, 256 * 1024), input, raw, svg, version);
  return bytes;
}
