/** Diagnostic heuristics, not a complete SVG validator or universal input policy. */
export function tags(svg: string, tag: string): Array<Record<string, string>> {
  return [...svg.matchAll(new RegExp(`<${tag}\\b([^>]*)/>`, 'g'))].map(m => Object.fromEntries(
    [...m[1]!.matchAll(/([\w:-]+)="([^"]*)"/g)].map(a => [a[1]!, a[2]!])
  ));
}

export type InputClass = 'ordinary_data_or_option' | 'invalid_input' | 'shape_policy_sensitive' | 'sign_or_configuration_policy_sensitive';
// These existing corpus inputs changed from rendered SVG to explicit rejection.
// Keep the original corpus and historical classified snapshots unchanged.
const signOptionContractChanges = new Set([
  'donut-negative', 'donut-mixed', 'radar-negative', 'radar-mixed', 'radar-zero-max',
]);
const rejected = new Set([
  'gauge-negative', 'gauge-mixed', 'gauge-nonfinite', 'gauge-zero-max', 'gauge-negative-max', 'gauge-nonfinite-max',
  'pyramid-negative', 'pyramid-mixed', 'pyramid-nonfinite', 'pyramid-mixed-nonfinite',
  'heatmap-nonfinite', 'heatmap-mixed-nonfinite', 'heatmap-ragged-short', 'heatmap-ragged-long',
  'waterfall-nonfinite', 'waterfall-mixed-nonfinite', 'waterfall-short-values', 'waterfall-long-values',
  'donut-nonfinite', 'radar-nonfinite', 'slope-nonfinite', 'slope-mixed-nonfinite',
  'scatter-negative-size', 'scatter-nonfinite-size',
  ...signOptionContractChanges,
]);
const omitted = new Set([
  'bar-nonfinite', 'line-nonfinite', 'line-nonfinite-x',
  'scatter-nonfinite', 'scatter-nonfinite-x', 'scatter-mixed-nonfinite',
]);
const shapes = new Set(['bar-short-values', 'bar-long-values']);
const flexibleRadar = new Set(['radar-empty-values', 'radar-short-values', 'radar-long-values']);
const signOrConfiguration = new Set([
  'donut-negative-hole',
]);
export function policy(id: string): { inputClass: InputClass; expectedRejection: boolean; intentionalOmission: boolean; documentedFlexibility: boolean; contractChange: string | null } {
  return {
    inputClass: shapes.has(id) ? 'shape_policy_sensitive' : signOrConfiguration.has(id) ? 'sign_or_configuration_policy_sensitive' : id.includes('nonfinite') || rejected.has(id) ? 'invalid_input' : 'ordinary_data_or_option',
    expectedRejection: rejected.has(id),
    intentionalOmission: omitted.has(id),
    documentedFlexibility: flexibleRadar.has(id),
    contractChange: signOptionContractChanges.has(id) ? 'svg_sign_option_contract_2026_10_04' : null,
  };
}

export function inspect(family: string, id: string, svg: string): { numericIssues: string[]; semanticIssues: string[] } {
  const numericIssues: string[] = [];
  for (const element of svg.matchAll(/<([\w:-]+)\b([^>]*)>/g)) {
    for (const attribute of element[2]!.matchAll(/([\w:-]+)="([^"]*)"/g)) {
      const [key, value] = [attribute[1]!, attribute[2]!];
      if (/NaN|[+-]?Infinity/.test(value)) numericIssues.push(`${element[1]}.${key}=${value}`);
      if (['r', 'rx', 'ry', 'width', 'height'].includes(key) && Number(value) < 0) numericIssues.push(`negative ${element[1]}.${key}=${value}`);
    }
  }
  if (family === 'heatmap') for (const rect of tags(svg, 'rect')) {
    if (!rect.fill) numericIssues.push('rect missing fill; SVG defaults to black');
  }
  const semanticIssues: string[] = [];
  if (id === 'heatmap-labels' && (!svg.includes('>X1</text>') || !svg.includes('>X2</text>'))) {
    semanticIssues.push('Requested xLabels X1 and X2 are absent');
  }
  if (id === 'heatmap-blues' || id === 'heatmap-plasma') {
    const fills = tags(svg, 'rect').map(r => r.fill);
    if (JSON.stringify(fills) === JSON.stringify(['#440154', '#fde725'])) semanticIssues.push('Requested colormap ignored: output still uses Viridis endpoints');
  }
  if (id === 'gauge-custom-full-band') {
    const d = tags(svg, 'path')[0]?.d ?? '';
    const outerArcs = [...d.matchAll(/A200,200\s+0\s+([01]),([01])/g)];
    if (outerArcs.length === 1 && outerArcs[0]![1] === '0') semanticIssues.push('Full 252-degree gauge band encoded as a short SVG arc');
  }
  if (id === 'bar-long-values') {
    const baseline = tags(svg, 'line').find(l => l['stroke-opacity'] === '0.16');
    if (baseline && Number(baseline.y1) < 470) semanticIssues.push('Unpaired negative value affects visible-category domain');
  }
  if (id === 'heatmap-ragged-long') {
    const rects = tags(svg, 'rect');
    if (rects.length === 2 && rects[0]!.fill === rects[1]!.fill) semanticIssues.push('Extra ragged cell omitted but influences retained-cell normalization');
  }
  if (id === 'waterfall-long-values') {
    const rects = tags(svg, 'rect');
    if (rects.length === 1 && Number(rects[0]!.height) < 400) semanticIssues.push('Unpaired steps are not drawn but still affect cumulative domain');
  }
  return { numericIssues, semanticIssues };
}
