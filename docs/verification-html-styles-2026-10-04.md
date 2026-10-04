# Legacy HTML stylesheet repair (2026-10-04)

This small repair is based on `c9d0df3eba19acc7d08a90c90f9be19c9b61e0e9`.
The previous `renderHtml()` inserted the complete `<style>…</style>` element
returned by `generateStyles()` inside its own stylesheet for the default/legacy
accent paths. The canonical branch already inserted only the rules.

All branches now unwrap that known generated element before insertion. The
legacy output loses exactly one redundant opening and closing style tag. The
stylesheet rules, animation declarations, outer wrapper CSS, escaped title and
embedded SVG are retained. Canonical HTML, SVG generation, Figure options and
native PNG output are unchanged. No public API, dependency or lockfile changes.

## Normal regression tests

`tests/svg-html-styles.test.ts` runs with the normal `npm test` command. It tests
19 selections (default, four explicit accents and all 14 canonical themes), each
with an ordinary and hostile title. A narrow generated-document parser verifies
balanced nesting and raw-text title/style handling; the declared esbuild CSS
parser must return no recovery warnings. Assertions also preserve the entire
original palette/animation stylesheet and verbatim SVG source. Two negative
cases prove the gate rejects the original nested-style defect and malformed CSS.
These 40 regression cases require no new package or external parser.

```sh
npm test
npm run lint
npm run test:package
node --import tsx --test tests/native-canonical-themes.test.mjs
node --test tests/native-canvas-runtime.test.mjs
```

The native checks require the declared canvas binding and its existing optional
librsvg capability. They do not use browser globals or contact remote services.

## Acceptance boundaries

The implementation was also checked with independent lxml HTML parsing and
strict LightningCSS parsing for all 38 actual HTML documents. Exact comparisons
to the baseline require only the redundant style wrapper to disappear in legacy
HTML, while canonical HTML and every embedded SVG remain byte-identical.

The supported browser remains blocked by `net::ERR_BLOCKED_BY_CLIENT`. Structural
HTML/CSS parsing and native rendering establish this markup repair's bounded
behavior; they do not establish browser animation, interaction, event handling,
layout or download acceptance. No browser workaround or remote CI was attempted.

Marker-aware SVG scatter endpoint padding and the versioned automatic-surface
policy are separate work; this repair changes neither.
