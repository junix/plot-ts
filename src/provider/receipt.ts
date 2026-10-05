import type { FigureInput, SupportedChart } from './input.js';
import type { RuntimeEvidence } from './runtime.js';
import { runtimeEvidence } from './runtime.js';
import { parseJson } from './json.js';
import { sha256 } from './io.js';
import { schemaCheck } from './schema-check.js';
import schema from './render-receipt-v1.schema.json' with { type: 'json' };
import type { CanonicalThemeName, SurfacePolicy } from '../svg/index.js';
export const REGISTRY_SHA256 = 'a08a0f37a45fba66c694b428a47aec76b5a3fbcf96c50a5adfb286a95fb7b828';
type Limitation = 'system-fonts-unmeasured' | 'order-color-series-without-legend' | 'numeric-axis-labels-unavailable' | 'heatmap-label-fit-approximate-with-full-title';
export interface RenderReceipt {
  schema_version: 'plot-ts.render-receipt/v1'; provider: { id: 'plot-provider-plot-ts'; version: string };
  profile: 'plot-ts-svg-static/1'; input_schema: 'plot-ts.svg-figure/v1';
  artifact_receipt: { schema_version: 'plot.artifact-receipt-core/v1'; inputs: [{ role: 'input'; sha256: string; bytes: number }]; primary: { artifact_id: 'figure'; role: 'primary'; argument: 'output'; kind: 'svg'; sha256: string; bytes: number } };
  figure: { width: number; height: number; columns: number; gap: number; chart_types: SupportedChart['type'][]; legend_panels: { panel_index: number; profile: 'series-names-v1' }[] };
  theme: { mode: 'legacy' } | { mode: 'canonical'; name: CanonicalThemeName; registry_sha256: typeof REGISTRY_SHA256 };
  surface: { schema_version: 'plot.surface-policy/v1'; policy: SurfacePolicy };
  rendering: { mode: 'static' }; runtime: RuntimeEvidence;
  limitations: { panel_index: number; chart_type: SupportedChart['type']; code: Limitation }[];
}
export function makeReceipt(input: FigureInput, raw: Buffer, svg: Buffer, version: string): Buffer {
  const options = input.figure ?? {};
  const receipt: RenderReceipt = {
    schema_version: 'plot-ts.render-receipt/v1', provider: { id: 'plot-provider-plot-ts', version }, profile: 'plot-ts-svg-static/1', input_schema: input.schema_version,
    artifact_receipt: { schema_version: 'plot.artifact-receipt-core/v1', inputs: [{ role: 'input', sha256: sha256(raw), bytes: raw.length }], primary: { artifact_id: 'figure', role: 'primary', argument: 'output', kind: 'svg', sha256: sha256(svg), bytes: svg.length } },
    figure: { width: options.width ?? 800, height: options.height ?? 500, columns: Math.min(options.columns ?? Math.ceil(Math.sqrt(input.charts.length)), input.charts.length), gap: options.gap ?? 16, chart_types: input.charts.map(c => c.type), legend_panels: [] },
    theme: options.theme === undefined ? { mode: 'legacy' } : { mode: 'canonical', name: options.theme, registry_sha256: REGISTRY_SHA256 },
    surface: { schema_version: 'plot.surface-policy/v1', policy: options.surfacePolicy ?? 'themed-v1' }, rendering: { mode: 'static' }, runtime: runtimeEvidence(), limitations: [],
  };
  input.charts.forEach((chart, panel_index) => {
    const add = (code: Limitation) => receipt.limitations.push({ panel_index, chart_type: chart.type, code });
    add('system-fonts-unmeasured');
    if (chart.type === 'column' || chart.type === 'line') {
      if (chart.legend) receipt.figure.legend_panels.push({ panel_index, profile: chart.legend });
      else add('order-color-series-without-legend');
    }
    if (chart.type !== 'heatmap') add('numeric-axis-labels-unavailable');
    else add('heatmap-label-fit-approximate-with-full-title');
  });
  const bytes = Buffer.from(JSON.stringify(receipt) + '\n');
  schemaCheck(parseJson(bytes, 256 * 1024), schema);
  return bytes;
}
