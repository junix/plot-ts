export interface RuntimeEvidence {
  node: string; v8: string; icu: string; unicode: string; cldr: string; platform: string; arch: string; locale: string;
}
export function runtimeEvidence(): RuntimeEvidence {
  return { node: process.versions.node, v8: process.versions.v8, icu: process.versions.icu ?? 'unavailable', unicode: process.versions.unicode ?? 'unavailable', cldr: process.versions.cldr ?? 'unavailable', platform: process.platform, arch: process.arch, locale: Intl.DateTimeFormat().resolvedOptions().locale };
}
export function readiness(): string[] {
  const missing: string[] = [];
  if (!['22', '24'].includes(process.versions.node.split('.')[0]!)) missing.push('supported-node-22-or-24');
  if (process.platform !== 'linux' && process.platform !== 'darwin') missing.push('posix-platform');
  if (typeof Intl.Segmenter !== 'function') missing.push('intl-segmenter');
  if (process.env.NODE_OPTIONS || process.env.NODE_PATH) missing.push('clean-node-environment');
  return missing;
}
