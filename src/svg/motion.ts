/** Bounded SVG entry motion. CSS playback and deterministic frames use this plan. */
import { h, type Html } from '../util/html.js';
import { MOTION } from '../style/tokens.js';

export const SVG_MOTION_LIMIT = 2048;
export const SVG_MOTION_END_MS = 1600;
const SCOPE = '[data-plot-motion="entry-v1"]';
const TARGET = `${SCOPE} [data-plot-motion-target][data-plot-motion-playback="entry-v1"]`;

export interface SvgFrameOptions {
  /** Return the validated static figure immediately, without the motion budget. */
  reducedMotion?: boolean;
}

export class MotionTargetLimitError extends RangeError {
  constructor() {
    super(`SVG entry motion supports at most ${SVG_MOTION_LIMIT} rendered targets; use animated: false for static output`);
  }
}

type Motion = { kind: 'grow'; origin: number } | { kind: 'fade'; rise: number };

export class SvgMotionPlan {
  private targets: Motion[] = [];

  wrap(body: Html, motion: Motion): Html {
    if (this.targets.length >= SVG_MOTION_LIMIT) throw new MotionTargetLimitError();
    const index = this.targets.length;
    this.targets.push(motion);
    return h('g', { 'data-plot-motion-target': index }, body);
  }

  grow(body: Html, origin: number, height: number): Html {
    // Accepted explicit domains can place zero beyond the viewport. Keep that
    // geometry, but avoid moving marks toward an off-panel origin.
    return this.wrap(body, origin >= 0 && origin <= height
      ? { kind: 'grow', origin }
      : { kind: 'fade', rise: 0 });
  }

  fade(body: Html, rise = 0): Html {
    return this.wrap(body, { kind: 'fade', rise });
  }

  private delay(index: number): number {
    // Floor to microseconds: floating-point/serialization must not push the
    // last 440ms target beyond the fixed 1.6s limit.
    const step = Math.min(MOTION.stagger, (SVG_MOTION_END_MS - MOTION.chartDuration) / Math.max(1, this.targets.length - 1));
    return Math.floor(index * step * 1000) / 1000;
  }

  get endMs(): number {
    return this.targets.reduce((end, target, index) => Math.max(end,
      this.delay(index) + (target.kind === 'grow' ? MOTION.chartDuration : MOTION.duration)), 0);
  }

  apply(svg: string, timeMs?: number): string {
    return svg.replace(/<g data-plot-motion-target="(\d+)">/g, (_match, ordinal: string) => {
      const index = Number(ordinal), target = this.targets[index]!;
      const duration = target.kind === 'grow' ? MOTION.chartDuration : MOTION.duration;
      const delay = this.delay(index);
      if (timeMs !== undefined) {
        const progress = easeOut(Math.max(0, Math.min(1, (timeMs - delay) / duration)));
        const transform = target.kind === 'grow'
          ? `translate(0 ${target.origin}) scale(1 ${progress}) translate(0 ${-target.origin})`
          : `translate(0 ${target.rise * (1 - progress)})`;
        return h('g', {
          'data-plot-motion-target': index,
          'data-plot-motion-kind': target.kind,
          transform,
          opacity: target.kind === 'fade' ? progress : undefined,
        }).replace('</g>', '');
      }
      return h('g', {
        'data-plot-motion-target': index,
        'data-plot-motion-kind': target.kind,
        'data-plot-motion-playback': 'entry-v1',
        style: `--plot-ts-entry-delay:${delay}ms;--plot-ts-entry-origin:${target.kind === 'grow' ? target.origin : 0}px;--plot-ts-entry-rise:${target.kind === 'fade' ? target.rise : 0}px`,
      }).replace('</g>', '');
    });
  }
}

/** Solve the very same cubic-bezier(.22,1,.36,1) emitted for CSS. */
function easeOut(x: number): number {
  if (x === 0 || x === 1) return x;
  let lo = 0, hi = 1;
  for (let i = 0; i < 48; i++) {
    const t = (lo + hi) / 2, u = 1 - t;
    const at = 3 * u * u * t * 0.22 + 3 * u * t * t * 0.36 + t * t * t;
    if (at < x) lo = t;
    else hi = t;
  }
  const t = (lo + hi) / 2;
  return 1 - (1 - t) ** 3;
}

/** Fixed, versioned selectors/keyframes; all instance values live on wrappers. */
export function svgMotionCss(): string {
  return `
    ${TARGET} { animation-delay: var(--plot-ts-entry-delay); animation-timing-function: ${MOTION.easeOut}; animation-fill-mode: both; }
    ${TARGET}[data-plot-motion-kind="grow"] { transform-box: view-box; transform-origin: 0px var(--plot-ts-entry-origin); animation-name: plot-ts-svg-entry-v1-grow; animation-duration: ${MOTION.chartDuration}ms; }
    ${TARGET}[data-plot-motion-kind="fade"] { animation-name: plot-ts-svg-entry-v1-fade; animation-duration: ${MOTION.duration}ms; }
    @keyframes plot-ts-svg-entry-v1-grow { from { transform: scaleY(0); } to { transform: scaleY(1); } }
    @keyframes plot-ts-svg-entry-v1-fade { from { opacity: 0; transform: translateY(var(--plot-ts-entry-rise)); } to { opacity: 1; transform: translateY(0); } }
    @media (prefers-reduced-motion: reduce) { ${TARGET} { animation: none !important; opacity: 1 !important; transform: none !important; } }
  `;
}
