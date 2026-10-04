/** Renderer-owned policy, independent of canonical colors and semantic paints. */
export const SURFACE_POLICY_VERSION = 'plot.surface-policy/v1' as const;
export const SURFACE_POLICIES = Object.freeze([
  'themed-v1', 'transparent-root-v1', 'transparent-auto-v1',
] as const);
export type SurfacePolicy = typeof SURFACE_POLICIES[number];

/** Parse one exact versioned identifier; omission is handled by the caller. */
export function parseSurfacePolicy(value: unknown): SurfacePolicy {
  if (value === 'themed-v1' || value === 'transparent-root-v1' || value === 'transparent-auto-v1') return value;
  throw new RangeError('Unknown surface policy; expected themed-v1, transparent-root-v1, or transparent-auto-v1');
}

/** Internal registered automatic roles. Never infer a role from shape or color. */
export function surfaceFill(policy: SurfacePolicy, role: 'root' | 'panel', fill: string, clear: 'none' | 'transparent'): string {
  return policy === 'transparent-auto-v1' || (policy === 'transparent-root-v1' && role === 'root') ? clear : fill;
}
