# Figure/ECharts automatic-surface policy

`FigureConfig.surfacePolicy` accepts the same exact `plot.surface-policy/v1`
identifiers as the SVG engine. Omission and `themed-v1` keep existing options,
theme handling, colors and white/canonical export matte. They do not intercept
raw ECharts calls.

```ts
const chart = new Figure(container, {
  theme: 'sage-dark', surfacePolicy: 'transparent-auto-v1', animated: false,
}).bar(['A', 'B'], [20, 40], { color: '#123456' });
chart.render();
const png = chart.exportImage('png');
```

- `transparent-root-v1` clears the ECharts canvas and PNG export matte. It keeps
  automatic component backings, including a canonical grid panel
- `transparent-auto-v1` also clears registered grid, component-tooltip, legend,
  visualMap and Cartesian axis-pointer label backings
- Transparent JPEG export/download rejects before export or DOM/click effects.
  JPEG cannot retain alpha. Use PNG or explicitly select `themed-v1`

Invalid policy values reject before container size writes, ECharts initialization
or listener registration. A transparent-policy Figure requires a new ECharts
instance, and no second Figure may borrow an instance already guarded by one: dispose an existing chart on that container first. Its previous raw
option authorship cannot safely be assumed.

## Ownership and authored options

Transparent policies install a guard on that one ECharts instance's `setOption`
immediately after initialization. No global/prototype method is patched. Both
`getRawChart()` and `getECharts()` still return the real same instance. Disposal
restores its method when the guard still owns it.

The guard validates explicitly supplied paints on registered backing paths
before forwarding a mutation. A visible or unrecognized authored paint on a
surface the selected policy must clear raises a `RangeError` naming the path.
Fully transparent colors are allowed; omitted/null paints are automatic defaults.
Strong mode also rejects nonempty tooltip `extraCssText` and `className`: arbitrary
container CSS could paint an opaque backing despite a transparent backgroundColor.
This is a conservative rejection, not CSS interpretation. Rich-text highlights
and custom formatter content remain authored semantic content outside automatic
backing inference. Root-only mode allows authored visible inner panels because it does not clear
those roles. Semantic paints always remain caller-owned.

The adapter shallow-copies only registered paths. It preserves callback functions,
typed arrays, gradient/class values used as semantic paints, series/data objects,
raw `graphic` objects and unrelated option identity. It does not serialize options
through JSON. Both setOption overloads and the original notMerge/replaceMerge/
lazyUpdate/silent arguments are forwarded. It does not create absent grid,
legend or visualMap components just to clear their backgrounds.

Explicit backing validation and copy-on-write apply recursively to `baseOption`,
timeline `options`, and each media `option`, including currently inactive branches.
Thus an ordinary later frame or media selection cannot install an already-known
conflicting backing. Current effective registered backgrounds are also checked
before every typed builder/axis/title/grid mutation, render/update, streaming
registration and callback, resize, and PNG export. A blocked operation does not
leave hidden builder edits that become visible after reset. A running stream
whose ownership check fails stops its interval before throwing one error through
the host callback; it never silently retries each tick. Checks bracket the
generator, so a generator-induced conflict also stops before append. After an
explicit reset/rebuild, start a new stream to resume. Window resize callbacks
also validate before calling the native renderer; failures propagate for that
event. Stop/dispose remain idempotent recovery operations. This detects a
visible mutation made by deliberately bypassing the instance method, such as
calling the prototype's `setOption` directly, before the adapter silently clears
it. If ownership has been lost, explicitly reset/clear the chart and rebuild it;
no user content is silently removed to repair the conflict.

## Exact boundary

Registered paths are canvas backgroundColor; grid/tooltip/legend/visualMap
component backgroundColor; global axisPointer label backgroundColor; xAxis/yAxis
axisPointer label backgroundColor; and tooltip axisPointer label/cross-style
text backgroundColor. The adapter sets explicit clear defaults for its Cartesian
axis-pointer component, whose label plates ECharts creates automatically.

No colors are inferred to be backgrounds. Bars, lines, areas, markers, numerical
heatmaps, swatches, ramps, handles, needles and arbitrary raw graphics stay
painted, including white or theme-paper-colored semantic marks. Tokens, opacity,
geometry and animation choices are unchanged. Existing shadows/borders remain.
Transparent output does not adapt semantic colors to an arbitrary host.

The guarantee is for registered surfaces of the supported Figure paths, not
every ECharts component or custom renderer. Raw custom graphics, rich-text
fragments and series-specific tooltip customization are outside this typed
backing registry. Raw combinations that cause ECharts to synthesize unowned
visible backing defaults can fail the live ownership check; render through the
Figure builder first or use direct raw ECharts rendering/export without claiming
this policy. Monkey-patching other methods or intentionally bypassing all guard
checks is not a supported security boundary.

## Verification and browser gap

```sh
npm test
npm run lint
npm run test:package
npm run build
PLOT_TS_BROWSER_SURFACE_EVIDENCE_DIR=out/browser-surfaces \
  node --import tsx --test tests/native-browser-surface-policy.test.mjs
```

Normal tests cover all canonical themes and legacy/default selection, exact
version parsing, semantic colors/data, authored conflicts, future branches,
copy-on-write identities, method restoration and JPEG rejection before effects.
Native tests use locked ECharts 6.1.0 and declared canvas 3.2.3. The test harness
injects real native ECharts/canvas and an isolated listener host into actual
Figure source. This is an integration probe, not a new supported server Figure
API and not a real browser HTMLElement.

The native gate checks actual decoded PNG alpha for five chart families, explicit
root versus panel behavior, ordinary raw-graphic persistence, overload/merge/
media/timeline paths, prototype-bypass rejection and actual axis-pointer glyphs
and backing plates. ECharts 6.1.0's TooltipView deliberately skips init/render/
showTip when `env.node` is true, including requested richText mode. The targeted
probe records this unsupported boundary; no environment flags are changed.
Generated tooltip options alone do not establish visible tooltip acceptance.

Browser layout, HTML/rich-text tooltip interaction, event handling, downloads and
animation remain unverified under the supported cloud-CUA localhost
`net::ERR_BLOCKED_BY_CLIENT` blocker. No alternative browser route, remote CI,
animation change or scatter-padding change is included.
