import type { ScaledFigureInput, SupportedScaledChart } from './input-scaled.js';
import type { RenderReceipt } from './receipt.js';
import { REGISTRY_SHA256 } from './receipt.js';
import { runtimeEvidence } from './runtime.js';
import { fail, parseJson } from './json.js';
import { sha256 } from './io.js';
import { schemaCheck } from './schema-check.js';
import schema from './scaled-render-receipt-v1.schema.json' with { type: 'json' };
type ScaledLimitation = 'system-fonts-unmeasured' | 'scaled-axes-fit-approximate' | 'scaled-axes-interior-ticks-fit-dependent' | 'binary64-and-svg-coordinate-rounding' | 'order-color-series-without-legend';
type ScaledPanel = { panel_index: number; chart_type: 'line' | 'scatter'; profile: 'scaled-axes-v1'; axes: 'xy'; x_scale: 'linear' | 'log10'; y_scale: 'linear' | 'log10'; unit_axes: ('y' | 'x')[] };
export interface ScaledRenderReceipt extends Omit<RenderReceipt, 'schema_version' | 'profile' | 'input_schema' | 'figure' | 'limitations'> {
  schema_version: 'plot-ts.scaled-render-receipt/v1'; profile: 'plot-ts-svg-static-scaled-axes/1'; input_schema: 'plot-ts.svg-scaled-figure/v1';
  figure: RenderReceipt['figure'] & { scaled_axes_panels: ScaledPanel[] };
  renderer_source: { schema_version: 'plot-ts.native-source-set/v1'; sha256: string };
  limitations: { panel_index: number; chart_type: SupportedScaledChart['type']; code: ScaledLimitation }[];
}
/** Requested-and-validated metadata only. Native rendering exclusively owns domains and geometry. */
function receiptValue(input: ScaledFigureInput, raw: Buffer, svg: Buffer, version: string, sourceSha256: string): ScaledRenderReceipt {
  const options = input.figure ?? {};
  const receipt: ScaledRenderReceipt = {
    schema_version: 'plot-ts.scaled-render-receipt/v1', provider: { id: 'plot-provider-plot-ts', version }, profile: 'plot-ts-svg-static-scaled-axes/1', input_schema: input.schema_version,
    artifact_receipt: { schema_version: 'plot.artifact-receipt-core/v1', inputs: [{ role: 'input', sha256: sha256(raw), bytes: raw.length }], primary: { artifact_id: 'figure', role: 'primary', argument: 'output', kind: 'svg', sha256: sha256(svg), bytes: svg.length } },
    figure: { width: options.width ?? 800, height: options.height ?? 500, columns: Math.min(options.columns ?? Math.ceil(Math.sqrt(input.charts.length)), input.charts.length), gap: options.gap ?? 16, chart_types: input.charts.map(c => c.type), legend_panels: [], scaled_axes_panels: [] },
    theme: options.theme === undefined ? { mode: 'legacy' } : { mode: 'canonical', name: options.theme, registry_sha256: REGISTRY_SHA256 },
    surface: { schema_version: 'plot.surface-policy/v1', policy: options.surfacePolicy ?? 'themed-v1' }, rendering: { mode: 'static' }, renderer_source: { schema_version: 'plot-ts.native-source-set/v1', sha256: sourceSha256 }, runtime: runtimeEvidence(), limitations: [],
  };
  input.charts.forEach((chart, panel_index) => {
    const add = (code: ScaledLimitation) => receipt.limitations.push({ panel_index, chart_type: chart.type, code });
    add('system-fonts-unmeasured');
    add('scaled-axes-fit-approximate');
    add('scaled-axes-interior-ticks-fit-dependent');
    add('binary64-and-svg-coordinate-rounding');
    const unit_axes: ('y' | 'x')[] = [];
    if (chart.unit !== undefined) unit_axes.push('y');
    if (chart.xUnit !== undefined) unit_axes.push('x');
    receipt.figure.scaled_axes_panels.push({ panel_index, chart_type: chart.type, profile: chart.axes, axes: 'xy', x_scale: chart.xScale ?? 'linear', y_scale: chart.yScale ?? 'linear', unit_axes });
    if (chart.type === 'line') {
      if (chart.legend) receipt.figure.legend_panels.push({ panel_index, profile: chart.legend });
      else add('order-color-series-without-legend');
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
export function validateScaledReceipt(value: unknown, input: ScaledFigureInput, raw: Buffer, svg: Buffer, version: string, sourceSha256: string): void {
  schemaCheck(value, schema);
  // Full comparison enforces complete ordered panel coverage, chart/profile and unit
  // correspondence, legends, limitation order, resolved options and actual byte bindings.
  // It never reconstructs native ticks, domains, layout or omitted-label counts.
  if (!equal(value, receiptValue(input, raw, svg, version, sourceSha256))) fail('receipt_invalid');
}
export function makeScaledReceipt(input: ScaledFigureInput, raw: Buffer, svg: Buffer, version: string, sourceSha256: string): Buffer {
  const bytes = Buffer.from(JSON.stringify(receiptValue(input, raw, svg, version, sourceSha256)) + '\n');
  validateScaledReceipt(parseJson(bytes, 256 * 1024), input, raw, svg, version, sourceSha256);
  return bytes;
}
