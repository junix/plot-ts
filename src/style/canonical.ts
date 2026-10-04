/** Opt-in, pinned diagram-theme/v1 colors. Legacy theme globals are independent. */
import { canonicalThemeData } from './canonical-generated.js';

export type CanonicalThemeName = keyof typeof canonicalThemeData;
export type CanonicalTokenName = keyof typeof canonicalThemeData.azure;
export interface CanonicalTheme {
  readonly name: CanonicalThemeName;
  readonly tokens: Readonly<Record<CanonicalTokenName, string>>;
  /** Categorical order is exactly --s1 through --s8; repeat after eight. */
  readonly series: readonly string[];
}

export const CANONICAL_THEME_NAMES: readonly CanonicalThemeName[] = Object.freeze(
  Object.keys(canonicalThemeData) as CanonicalThemeName[],
);

const themes = new Map<string, CanonicalTheme>(CANONICAL_THEME_NAMES.map(name => {
  const tokens = Object.freeze({ ...canonicalThemeData[name] });
  const series = Object.freeze([
    tokens['--s1'], tokens['--s2'], tokens['--s3'], tokens['--s4'],
    tokens['--s5'], tokens['--s6'], tokens['--s7'], tokens['--s8'],
  ]);
  return [name, Object.freeze({ name, tokens, series })];
}));

/** Unknown names reject rather than silently selecting a different color scheme. */
export function getCanonicalTheme(name: string): CanonicalTheme {
  const theme = findCanonicalTheme(name);
  if (!theme) throw new RangeError(`Unknown canonical theme: ${name}. Available: ${CANONICAL_THEME_NAMES.join(', ')}`);
  return theme;
}

/** Internal optional lookup lets Figure keep accepting registered ECharts themes. */
export function findCanonicalTheme(name: string | undefined): CanonicalTheme | undefined {
  return name === undefined ? undefined : themes.get(name);
}

/** Keep labels drawn inside categorical marks legible on light and dark fills. */
export function canonicalMarkText(color: string): string {
  const rgb = [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  const luminance = rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
  return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? '#000000' : '#FFFFFF';
}

/** Native ECharts theme object, reused by Figure without global registration. */
export function canonicalEChartsTheme(theme: CanonicalTheme) {
  const t = theme.tokens;
  const axis = () => ({
    axisLine: { lineStyle: { color: t['--line'] } },
    axisTick: { lineStyle: { color: t['--line'] } },
    axisLabel: { color: t['--muted'] },
    nameTextStyle: { color: t['--muted'] },
    splitLine: { lineStyle: { color: t['--grid'] } },
    splitArea: { show: false },
  });
  return {
    color: [...theme.series],
    backgroundColor: t['--paper'],
    textStyle: { color: t['--ink'] },
    title: { textStyle: { color: t['--ink'] }, subtextStyle: { color: t['--muted'] } },
    legend: { textStyle: { color: t['--muted'] } },
    tooltip: { backgroundColor: t['--panel'], borderColor: t['--line'], textStyle: { color: t['--ink'] } },
    grid: { backgroundColor: t['--panel'], borderColor: t['--line'] },
    categoryAxis: axis(), valueAxis: axis(), logAxis: axis(), timeAxis: axis(),
    visualMap: { textStyle: { color: t['--muted'] } },
  };
}
