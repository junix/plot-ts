import type { ECharts } from 'echarts';
import type { SurfacePolicy } from '../style/surface.js';

type Option = Record<string, any>;
type ColorParser = (value: string) => number[] | undefined;
const object = (value: unknown): value is Option => value !== null && typeof value === 'object' && !Array.isArray(value);
const components = ['grid', 'tooltip', 'legend', 'visualMap'] as const;
const guardedCharts = new WeakSet<ECharts>();

/** A second Figure must not borrow an instance whose surfaces another one owns. */
export function hasSurfaceGuard(chart: ECharts): boolean { return guardedCharts.has(chart); }

/** Own only known automatic backing paths. No traversal of series/graphic paint. */
export class EChartsSurfaceGuard {
  private original: ECharts['setOption'];
  private guarded: ECharts['setOption'];

  constructor(private chart: ECharts, private policy: Exclude<SurfacePolicy, 'themed-v1'>, private parseColor: ColorParser) {
    if (chart.getOption() !== undefined) {
      throw new RangeError('Surface policy requires a new ECharts instance; existing raw option ownership is unknown');
    }
    this.original = chart.setOption;
    this.guarded = ((option: Option, ...args: any[]) => {
      const notMerge = typeof args[0] === 'object' ? args[0]?.notMerge === true : args[0] === true;
      // Check incoming explicit paints before any ECharts mutation. A reset does
      // not inherit the previous model; otherwise refuse bypassed raw conflicts.
      this.validateInput(option, 'option');
      if (!notMerge) this.assertCompatible();
      return (this.original as any).call(chart, this.prepare(option), ...args);
    }) as ECharts['setOption'];
    chart.setOption = this.guarded;
    guardedCharts.add(chart);
  }

  /** Recheck live effective fields before export, including bypassed mutations. */
  assertCompatible(): void {
    const option = this.chart.getOption();
    if (option !== undefined) this.validateKnown(option, 'live', false);
  }

  restore(): void {
    guardedCharts.delete(this.chart);
    if (this.chart.setOption === this.guarded) this.chart.setOption = this.original;
  }

  private clear(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    const rgba = this.parseColor(value);
    return !!rgba && rgba[3] === 0;
  }

  private check(value: unknown, path: string, authored: boolean): void {
    // Omission/null reset to automatic defaults, which prepare owns. A live
    // omitted backing is also non-painting; explicit visible/unknown paint is not.
    if (value === undefined || value === null) return;
    if (!this.clear(value)) {
      throw new RangeError(`Surface policy conflict at ${path}: ${authored ? 'authored' : 'live'} background must be fully transparent`);
    }
  }

  private each(value: unknown, path: string, fn: (entry: Option, path: string) => void): void {
    if (Array.isArray(value)) value.forEach((entry, index) => { if (object(entry)) fn(entry, `${path}[${index}]`); });
    else if (object(value)) fn(value, path);
  }

  private validateKnown(option: Option, path: string, authored: boolean): void {
    this.check(option.backgroundColor, `${path}.backgroundColor`, authored);
    if (this.policy !== 'transparent-auto-v1') return;
    for (const key of components) this.each(option[key], `${path}.${key}`, (entry, p) => {
      this.check(entry.backgroundColor, `${p}.backgroundColor`, authored);
      if (key === 'tooltip') {
        for (const css of ['extraCssText', 'className']) {
          if (entry[css] !== undefined && entry[css] !== null && entry[css] !== '') {
            throw new RangeError(`Surface policy conflict at ${p}.${css}: authored tooltip container CSS is unsupported in transparent-auto-v1`);
          }
        }
        this.check(entry.axisPointer?.label?.backgroundColor, `${p}.axisPointer.label.backgroundColor`, authored);
        this.check(entry.axisPointer?.crossStyle?.textStyle?.backgroundColor, `${p}.axisPointer.crossStyle.textStyle.backgroundColor`, authored);
      }
    });
    this.each(option.axisPointer, `${path}.axisPointer`, (entry, p) => this.check(entry.label?.backgroundColor, `${p}.label.backgroundColor`, authored));
    for (const key of ['xAxis', 'yAxis']) this.each(option[key], `${path}.${key}`, (entry, p) => {
      this.check(entry.axisPointer?.label?.backgroundColor, `${p}.axisPointer.label.backgroundColor`, authored);
    });
  }

  private validateInput(option: Option, path: string): void {
    if (!object(option)) throw new RangeError('Surface policy requires an ECharts option object');
    this.validateKnown(option, path, true);
    if (object(option.baseOption)) this.validateInput(option.baseOption, `${path}.baseOption`);
    if (Array.isArray(option.options)) option.options.forEach((entry, i) => {
      if (object(entry)) this.validateInput(entry, `${path}.options[${i}]`);
    });
    if (Array.isArray(option.media)) option.media.forEach((entry, i) => {
      if (object(entry) && object(entry.option)) this.validateInput(entry.option, `${path}.media[${i}].option`);
    });
  }

  private map(value: unknown, fn: (entry: Option) => Option): unknown {
    return Array.isArray(value) ? value.map(entry => object(entry) ? fn(entry) : entry) : object(value) ? fn(value) : value;
  }

  private pointer(value: unknown): Option {
    const pointer = object(value) ? value : {};
    return { ...pointer, label: { ...pointer.label, backgroundColor: 'transparent' } };
  }

  private prepare(input: Option): Option {
    // Shallow-copy only registered paths. Data arrays, functions and raw graphic
    // objects keep their identity; caller input is never mutated.
    const option: Option = { ...input, backgroundColor: 'transparent' };
    if (this.policy === 'transparent-auto-v1') {
      for (const key of components) if (input[key] !== undefined) {
        option[key] = this.map(input[key], entry => ({
          ...entry, backgroundColor: 'transparent',
          ...(key === 'tooltip' ? { axisPointer: this.pointer(entry.axisPointer) } : {}),
        }));
      }
      for (const key of ['xAxis', 'yAxis']) if (input[key] !== undefined) {
        option[key] = this.map(input[key], entry => ({ ...entry, axisPointer: this.pointer(entry.axisPointer) }));
      }
      if (input.axisPointer !== undefined) option.axisPointer = this.map(input.axisPointer, entry => this.pointer(entry));
      // ECharts's axisPointer preprocessor creates this component for every
      // option, including clear()/notMerge resets. Own that automatic label
      // default without creating any grid/legend/visualMap component.
      if (input.axisPointer == null || input.axisPointer === false || (Array.isArray(input.axisPointer) && input.axisPointer.length === 0)) option.axisPointer = this.pointer({});
    }
    if (object(input.baseOption)) option.baseOption = this.prepare(input.baseOption);
    if (Array.isArray(input.options)) option.options = input.options.map(entry => object(entry) ? this.prepare(entry) : entry);
    if (Array.isArray(input.media)) option.media = input.media.map(entry => object(entry) && object(entry.option) ? { ...entry, option: this.prepare(entry.option) } : entry);
    return option;
  }
}
