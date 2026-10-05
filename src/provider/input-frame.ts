import { figure } from '../svg/index.js';
import { MotionTargetLimitError } from '../svg/motion.js';
import { validateInputV2, type FigureInputV2 } from './input-v2.js';
import { fail, object } from './json.js';
export interface FrameInput extends Omit<FigureInputV2, 'schema_version'> {
  schema_version: 'plot-ts.svg-frame/v1';
  frame: { profile: 'entry-v1'; time_ms: number; reduced_motion: boolean };
}
/** One raw-pinned document. Projection reuses V2 validation without negotiation. */
export function validateFrameInput(value: unknown): FrameInput {
  const root = object(value, ['schema_version', 'frame', 'figure', 'charts'], ['schema_version', 'frame', 'charts'], '$');
  if (root.schema_version !== 'plot-ts.svg-frame/v1') fail('unsupported_schema', '$.schema_version');
  const frame = object(root.frame, ['profile', 'time_ms', 'reduced_motion'], ['profile', 'time_ms', 'reduced_motion'], '$.frame');
  if (frame.profile !== 'entry-v1') fail('unsupported_value', '$.frame.profile');
  if (typeof frame.time_ms !== 'number' || !Number.isFinite(frame.time_ms) || frame.time_ms < 0) fail('invalid_number', '$.frame.time_ms');
  if (typeof frame.reduced_motion !== 'boolean') fail('expected_boolean', '$.frame.reduced_motion');
  const validated = validateInputV2({ schema_version: 'plot-ts.svg-figure/v2', ...(Object.hasOwn(root, 'figure') ? { figure: root.figure } : {}), charts: root.charts });
  return { ...validated, schema_version: 'plot-ts.svg-frame/v1', frame: { profile: 'entry-v1', time_ms: frame.time_ms as number, reduced_motion: frame.reduced_motion as boolean } };
}
export function renderFrameInput(input: FrameInput): string {
  const f = figure(input.figure);
  for (const chart of input.charts) {
    switch (chart.type) {
      case 'column': f.bar(chart); break;
      case 'line': f.line(chart); break;
      case 'scatter': f.scatter(chart); break;
      case 'heatmap': f.heatmap(chart); break;
    }
  }
  try { return f.renderFrame(input.frame.time_ms, { reducedMotion: input.frame.reduced_motion }); }
  catch (error) { return error instanceof MotionTargetLimitError ? fail('motion_target_limit', '$.charts') : fail('native_render_rejected'); }
}
