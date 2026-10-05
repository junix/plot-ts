import documentSchemaV2 from './svg-figure-v2.schema.json' with { type: 'json' };
import receiptSchemaV2 from './render-receipt-v2.schema.json' with { type: 'json' };
import documentSchema from './svg-figure-v1.schema.json' with { type: 'json' };
import receiptSchema from './render-receipt-v1.schema.json' with { type: 'json' };
declare const __PLOT_PROVIDER_VERSION__: string;
declare const __PLOT_PROVIDER_SOURCE_ROOT__: string;
export const VERSION = __PLOT_PROVIDER_VERSION__;
const SOURCE_ROOT = __PLOT_PROVIDER_SOURCE_ROOT__;
export const ID = 'plot-provider-plot-ts';
const file = (description: string, role: string) => ({ type: 'string', minLength: 1, maxLength: 4096, description, 'x-acme-role': role });
export const descriptor = {
  schema_version: 'plot-provider-plot-ts.describe/v1', provider: { id: ID, version: VERSION, protocol_versions: [1] }, source: { local_code_path: SOURCE_ROOT }, operations: ['render-svg', 'render-svg-v2'],
  commands: [{
    name: 'render-svg', capability_id: 'visualization.plot-ts.render-svg-v1', title: 'Render bounded plot-ts data to SVG',
    description: 'Local Node execution of supplied column, line/area, scatter and heatmap arrays or independent grids through the bundled pure-SVG engine. Static only, maximum 16 panels. Explicit series-names-v1 legends; no unit labels, numeric tick axes, line value labels, smoothing, DOM or browser renderer. Fonts remain viewer-resolved and unmeasured. No resource discovery or application network calls. Executable pin covers this script only, not Node, preloads or the transitive environment.',
    primitive: 'render', input_kinds: ['json'], output_kinds: ['svg', 'json'],
    input_schema: { type: 'object', properties: {
      input: file('Exact plot-ts.svg-figure/v1 JSON in an explicit regular file, at most 4 MiB. Original bytes are pinned.', 'input-file'),
      resource_pins: { type: 'object', properties: { input: { type: 'string', pattern: '^[0-9a-f]{64}$', description: 'Pin the original input file bytes with a lowercase SHA-256 digest.' } }, required: ['input'], additionalProperties: false, description: 'Exactly one raw input SHA-256; duplicate-free JSON, at most 1 KiB.' },
      output: file('Primary SVG, at most 8 MiB. Existing regular single-link destination or absent leaf with existing parent.', 'output-file'),
      receipt: { ...file('Mandatory closed path-free plot-ts.render-receipt/v1 JSON, at most 256 KiB.', 'output-file'), 'x-acme-receipt-core': { schema_version: 'plot.artifact-receipt-core/v1', primary_argument: 'output', artifact_id: 'figure', role: 'primary' } },
    }, required: ['input', 'resource_pins', 'output', 'receipt'], additionalProperties: false },
    output_schema: { type: 'object', properties: { path: { type: 'string', minLength: 1, description: 'Locate the primary SVG artifact published by the Hub.' }, kind: { type: 'string', enum: ['svg'], description: 'Identify the verified primary SVG artifact encoding.' } }, required: ['path', 'kind'], additionalProperties: false },
    suggested_command_path: ['visualization', 'plot-ts', 'render-svg-v1'],
    side_effects: { reads_files: true, writes_files: true, creates_artifacts: true, network: false, data_egress: false, downloads_models: false, uses_gpu: false, mutates_index: false, opens_viewer: false },
    availability: { available: true }, determinism: { level: 'environment-dependent', notes: 'Same script bytes, exact input/arguments, compatible pinned Node/ICU/locale and stable ordinary environment only. Node 22/24 on POSIX. No interpreter/preload attestation, OS sandbox, measured-font or pixel-parity promise; trusted launcher must control PATH and clear NODE_OPTIONS/NODE_PATH before process startup.' },
    cli_spec: { subcommand: ['render-svg'], positionals: ['input'], flags: [{ name: 'resource_pins', flag: '--resource-pins', kind: 'json', order: 10 }, { name: 'output', flag: '--output', kind: 'string', order: 20 }, { name: 'receipt', flag: '--receipt', kind: 'string', order: 30 }] },
    limits: { input_bytes: 4194304, svg_bytes: 8388608, receipt_bytes: 262144, json_depth: 16, json_nodes: 131072, charts: 16, chart_positions: 16384, numeric_data_scalars: 65536 },
    'x-plot-ts-document-schema': documentSchema, 'x-plot-ts-receipt-schema': receiptSchema,
  }, {
    name: 'render-svg-v2', capability_id: 'visualization.plot-ts.render-svg-v2', title: 'Render plot-ts numeric axes and full literal units to SVG',
    description: 'Local Node static SVG for supplied column, line/area and scatter panels requiring numeric-axes-v1, with full literal Y units and line/scatter X units. Unchanged categorical heatmaps may appear alone or in independent mixed grids. No unit conversion or common exponent. Native renderer exclusively owns domains, ticks and fit; failures reject the whole figure. Live viewer-resolved system fonts are unmeasured; approximate full-unit/tick fitting, interior-tick thinning and binary64/SVG rounding remain. Column value labels may round or be omitted; format/precision affect those labels only. No HTML, motion, smoothing, DOM or browser. No application network calls. Script pin does not attest Node, preloads, fonts or the transitive environment.',
    primitive: 'render', input_kinds: ['json'], output_kinds: ['svg', 'json'],
    input_schema: { type: 'object', properties: {
      input: file('Exact plot-ts.svg-figure/v2 JSON in an explicit regular file, at most 4 MiB. Original bytes are pinned.', 'input-file'),
      resource_pins: { type: 'object', properties: { input: { type: 'string', pattern: '^[0-9a-f]{64}$', description: 'Pin the original input file bytes with a lowercase SHA-256 digest.' } }, required: ['input'], additionalProperties: false, description: 'Exactly one raw input SHA-256; duplicate-free JSON, at most 1 KiB.' },
      output: file('Primary SVG, at most 8 MiB. Existing regular single-link destination or absent leaf with existing parent.', 'output-file'),
      receipt: { ...file('Mandatory closed path-free plot-ts.render-receipt/v2 JSON, at most 256 KiB.', 'output-file'), 'x-acme-receipt-core': { schema_version: 'plot.artifact-receipt-core/v1', primary_argument: 'output', artifact_id: 'figure', role: 'primary' } },
    }, required: ['input', 'resource_pins', 'output', 'receipt'], additionalProperties: false },
    output_schema: { type: 'object', properties: { path: { type: 'string', minLength: 1, description: 'Locate the primary SVG artifact published by the Hub.' }, kind: { type: 'string', enum: ['svg'], description: 'Identify the verified primary SVG artifact encoding.' } }, required: ['path', 'kind'], additionalProperties: false },
    suggested_command_path: ['visualization', 'plot-ts', 'render-svg-v2'],
    side_effects: { reads_files: true, writes_files: true, creates_artifacts: true, network: false, data_egress: false, downloads_models: false, uses_gpu: false, mutates_index: false, opens_viewer: false },
    availability: { available: true }, determinism: { level: 'environment-dependent', notes: 'Same script bytes, exact input/arguments, compatible pinned Node/ICU/locale and stable ordinary environment only. Node 22/24 on POSIX. No interpreter/preload attestation, OS sandbox, measured-font or pixel-parity promise; trusted launcher must control PATH and clear NODE_OPTIONS/NODE_PATH before process startup.' },
    cli_spec: { subcommand: ['render-svg-v2'], positionals: ['input'], flags: [{ name: 'resource_pins', flag: '--resource-pins', kind: 'json', order: 10 }, { name: 'output', flag: '--output', kind: 'string', order: 20 }, { name: 'receipt', flag: '--receipt', kind: 'string', order: 30 }] },
    limits: { input_bytes: 4194304, svg_bytes: 8388608, receipt_bytes: 262144, json_depth: 16, json_nodes: 131072, charts: 16, chart_positions: 16384, numeric_data_scalars: 65536 },
    'x-plot-ts-document-schema': documentSchemaV2, 'x-plot-ts-receipt-schema': receiptSchemaV2,
  }, { name: 'describe' }, { name: 'doctor' }],
};
