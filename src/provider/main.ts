import { validateScaledInput, renderScaledInput } from './input-scaled.js';
import { makeScaledReceipt } from './receipt-scaled.js';
import { validateFrameInput, renderFrameInput } from './input-frame.js';
import { makeFrameReceipt } from './receipt-frame.js';
declare const __PLOT_NATIVE_SOURCE_SHA256__: string;
import { descriptor, ID, VERSION } from './descriptor.js';
import { fail, object, parseJson, ProviderError } from './json.js';
import { validateInputV2, renderInputV2 } from './input-v2.js';
import { makeReceiptV2 } from './receipt-v2.js';
import { validateInput, renderInput } from './input.js';
import { publishPair, readRegular } from './io.js';
import { makeReceipt } from './receipt.js';
import { readiness, runtimeEvidence } from './runtime.js';
function main(args: string[]): void {
  if (args.length === 2 && args[1] === '--json' && args[0] === 'describe') { process.stdout.write(JSON.stringify(descriptor) + '\n'); return; }
  if (args.length === 2 && args[1] === '--json' && args[0] === 'doctor') {
    const missing = readiness();
    process.stdout.write(JSON.stringify({ schema_version: 'plot-provider-plot-ts.doctor/v1', provider: { id: ID, version: VERSION }, ok: missing.length === 0, items: [{ backend: 'bundled-svg-node', available: missing.length === 0, missing }], runtime: runtimeEvidence(), notes: ['Readiness is process feature evidence only; it does not validate unsupplied inputs, pin the interpreter, prevent preloads already executed, or attest transitive runtime identity. No input/output resource discovery or rendering probe.'] }) + '\n');
    return;
  }
  if (!['render-svg', 'render-svg-v2', 'render-svg-frame-v1', 'render-svg-scaled-v1'].includes(args[0] ?? '') || args.length !== 8 || !args[1] || args[1]!.startsWith('--')) fail('invalid_arguments');
  const flags: Record<string, string> = Object.create(null) as Record<string, string>;
  for (let i = 2; i < args.length; i += 2) {
    const key = args[i]!, value = args[i + 1]!;
    if (!['--resource-pins', '--output', '--receipt'].includes(key) || Object.hasOwn(flags, key) || !value) fail('invalid_arguments');
    flags[key] = value;
  }
  if (Object.keys(flags).length !== 3) fail('invalid_arguments');
  if (readiness().length) fail('runtime_not_ready');
  const pins = object(parseJson(Buffer.from(flags['--resource-pins']!), 1024), ['input'], ['input'], '$.resource_pins');
  if (typeof pins.input !== 'string' || !/^[0-9a-f]{64}$/.test(pins.input)) fail('invalid_pin');
  const source = readRegular(args[1]!, 4 * 1024 * 1024);
  if (source.hash !== pins.input) fail('input_pin_mismatch');
  const value = parseJson(source.bytes, 4 * 1024 * 1024, args[0] !== 'render-svg');
  let svg: Buffer, receipt: Buffer;
  if (args[0] === 'render-svg-scaled-v1') {
    const input = validateScaledInput(value);
    svg = Buffer.from(renderScaledInput(input));
    if (svg.length > 8 * 1024 * 1024) fail('artifact_limit');
    receipt = makeScaledReceipt(input, source.bytes, svg, VERSION, __PLOT_NATIVE_SOURCE_SHA256__);
  } else if (args[0] === 'render-svg-frame-v1') {
    const input = validateFrameInput(value);
    svg = Buffer.from(renderFrameInput(input));
    if (svg.length > 8 * 1024 * 1024) fail('artifact_limit');
    receipt = makeFrameReceipt(input, source.bytes, svg, VERSION, __PLOT_NATIVE_SOURCE_SHA256__);
  } else if (args[0] === 'render-svg-v2') {
    const input = validateInputV2(value);
    svg = Buffer.from(renderInputV2(input));
    if (svg.length > 8 * 1024 * 1024) fail('artifact_limit');
    receipt = makeReceiptV2(input, source.bytes, svg, VERSION);
  } else {
    const input = validateInput(value);
    svg = Buffer.from(renderInput(input));
    if (svg.length > 8 * 1024 * 1024) fail('artifact_limit');
    receipt = makeReceipt(input, source.bytes, svg, VERSION);
  }
  publishPair(source, flags['--output']!, flags['--receipt']!, svg, receipt);
}
try { main(process.argv.slice(2)); } catch (error) {
  // Never echo arbitrary input values, paths, runtime stacks or source snippets.
  process.stderr.write(JSON.stringify({ schema_version: 'plot-provider-plot-ts.error/v1', code: error instanceof ProviderError ? error.code : 'io_error', field: error instanceof ProviderError ? error.field : '$' }) + '\n');
  process.exitCode = 1;
}
