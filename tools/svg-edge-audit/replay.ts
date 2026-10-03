/** Replays exactly 118 bounded cases; unresolved diagnostics deliberately cause exit 1. */
import fs from 'node:fs';
import path from 'node:path';
import { replayCases } from './corpus.js';
import { inspect, policy } from './diagnostics.js';

const output = path.resolve(process.argv[2] ?? 'out/svg-edge-audit');
if (fs.existsSync(output)) throw new Error('Choose a new output directory; existing audit evidence is never overwritten: ' + output);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.mkdirSync(output);
const records: Array<Record<string, unknown>> = [];
replayCases((family, name, config, render, note = '') => {
  const id = `${family}-${name}`;
  const expected = policy(id);
  const record: Record<string, unknown> = {
    id, family, name, ...expected, note,
    config: JSON.stringify(config, (_key, value) => typeof value === 'number' && !Number.isFinite(value) ? String(value) : value),
  };
  try {
    const svg = render(config);
    fs.writeFileSync(path.join(output, id + '.svg'), svg);
    const issues = inspect(family, id, svg);
    record.outcome = 'rendered';
    record.svgFile = id + '.svg';
    Object.assign(record, issues);
    if (expected.expectedRejection) {
      record.assessment = 'expected_rejection_missing';
    } else if (issues.numericIssues.length || issues.semanticIssues.length) {
      record.assessment = expected.inputClass === 'ordinary_data_or_option' ? 'ordinary_input_defect' : 'invalid_or_shape_handling_defect';
    } else if (expected.documentedFlexibility) {
      record.assessment = 'documented_partial_or_extra_value_handling';
    } else if (expected.intentionalOmission) {
      record.assessment = 'intentional_finite_pair_omission';
    } else if (expected.inputClass !== 'ordinary_data_or_option') {
      record.assessment = 'policy_sensitive_no_defect_detected';
    } else {
      record.assessment = 'no_issue_detected';
    }
  } catch (error) {
    record.outcome = 'rejected';
    record.error = String(error);
    record.numericIssues = [];
    record.semanticIssues = [];
    record.assessment = expected.inputClass !== 'ordinary_data_or_option' && error instanceof RangeError ? 'intentional_invalid_input_rejection' : 'unexpected_rejection';
  }
  records.push(record);
});
if (records.length !== 118) throw new Error(`Corpus changed: expected 118 cases, got ${records.length}`);
const counts: Record<string, number> = {};
for (const record of records) counts[String(record.assessment)] = (counts[String(record.assessment)] ?? 0) + 1;
const hasIssues = records.some(r => ['expected_rejection_missing', 'ordinary_input_defect', 'invalid_or_shape_handling_defect', 'unexpected_rejection'].includes(String(r.assessment)));
const summary = {
  cases: records.length,
  rendered: records.filter(r => r.outcome === 'rendered').length,
  rejected: records.filter(r => r.outcome === 'rejected').length,
  numericOrMissingFillCases: records.filter(r => (r.numericIssues as string[]).length > 0).length,
  semanticIssueCases: records.filter(r => (r.semanticIssues as string[]).length > 0).length,
  counts,
  diagnosticExitCode: hasIssues ? 1 : 0,
  limitations: [
    'No-issue-detected does not prove all inputs or every feature is correct.',
    'Invalid and shape-policy cases are not treated as supported ordinary data.',
    'RangeError rejection of invalid inputs is distinguished from valid-data failures.',
    'This portable pass scans SVG strings; independent XML and raster verification is a separate check.',
    'The 13 regression witnesses are a separate test suite and do not erase unresolved diagnostic cases.',
  ],
};
fs.writeFileSync(path.join(output, 'classified-results.json'), JSON.stringify({ summary, cases: records }, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
process.exitCode = summary.diagnosticExitCode;
