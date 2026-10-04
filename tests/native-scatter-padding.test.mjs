/** Actual native raster containment. Build first; not browser acceptance.
 * node --import tsx --test tests/native-scatter-padding.test.mjs
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { figure, getCanonicalTheme } from '../dist/svg.js';
import { renderScatter } from '../src/svg/charts.ts';
const require = createRequire(import.meta.url);
const canvas = require('canvas');
const { createCanvas, loadImage } = canvas;
const dir = process.env.PLOT_TS_SCATTER_EVIDENCE_DIR;
if (dir) mkdirSync(dir, { recursive: true });
const artifacts = [], measurements = [];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function save(name, bytes) {
  if (!dir) return;
  writeFileSync(join(dir, name), bytes);
  artifacts.push({ name, bytes: Buffer.byteLength(bytes), sha256: hash(bytes) });
}
const corners = size => [{x:-5,y:-10,size},{x:5,y:-10,size},{x:-5,y:10,size},{x:5,y:10,size}];
const outer = (content, width, height, scale=1) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width*scale}" height="${height*scale}" viewBox="0 0 ${width} ${height}">${content}</svg>`;
const content = svg => svg.replace(/^<svg\b[^>]*>/, '').replace(/<\/svg>$/, '');
async function decode(svg) {
  const image = await loadImage(Buffer.from(svg));
  const surface = createCanvas(image.width, image.height);
  surface.getContext('2d').drawImage(image, 0, 0);
  return surface;
}
async function containment(name, svg, width, height, scale) {
  // Remove the viewport rather than trusting a clipped image's empty exterior.
  // Its padded, unclipped reference must paint no pixels outside the old bounds.
  const pad = 64, actual = await decode(outer(content(svg), width, height, scale));
  const reference = await decode(outer(`<g transform="translate(${pad},${pad})">${content(svg)}</g>`, width+pad*2, height+pad*2, scale));
  const ctx = reference.getContext('2d'), pixels = ctx.getImageData(0,0,reference.width,reference.height).data;
  let outside = 0, inside = 0;
  for (let y=0; y<reference.height; y++) for(let x=0; x<reference.width; x++) {
    if (!pixels[(y*reference.width+x)*4+3]) continue;
    if (x<pad*scale || x>=(pad+width)*scale || y<pad*scale || y>=(pad+height)*scale) outside++;
    else inside++;
  }
  assert.equal(outside, 0, `${name}: unclipped ink outside panel`);
  assert.ok(inside > 0, `${name}: actual ink exists`);
  assert.deepEqual(actual.getContext('2d').getImageData(0,0,actual.width,actual.height).data,
    ctx.getImageData(pad*scale,pad*scale,actual.width,actual.height).data, `${name}: clipped and unclipped ink agree`);
  const png = actual.toBuffer('image/png');
  save(`${name}-${scale}x.svg`, outer(content(svg),width,height,scale));
  save(`${name}-${scale}x.png`, png);
  measurements.push({name,scale,width:actual.width,height:actual.height,inside,outside,sha256:hash(png)});
}
const fixtures = [
  ['four-extrema-r15',300,200,{points:corners(15)}],
  ['four-extrema-r40',300,200,{points:corners(40),yAxis:true}],
  ['fractional-radii',300,200,{points:[{x:0,y:0,size:10.005},{x:1,y:10,size:15.005},{x:2,y:20,size:35.555}]}],
  ['variable-interior',300,200,{points:[...corners(4),{x:0,y:0,size:45}]}],
  ['single',180,140,{points:[{x:5,y:10,size:45}]}],
  ['constant-x',180,140,{points:[{x:5,y:-10,size:35},{x:5,y:10,size:35}]}],
  ['constant-y',180,140,{points:[{x:-5,y:10,size:35},{x:5,y:10,size:35}]}],
  ['narrow',31,40,{points:corners(15)}],
  ['narrow-axis',46,40,{points:corners(15),yAxis:true}],
  ['narrow-r35',71,71,{points:corners(35)}],
];
for (const theme of [undefined,'sage','sage-dark']) for (const [name,width,height,config] of fixtures) {
  test(`${theme??'legacy'}/${name}: uncut ink at 1x and 2x`, async () => {
    const svg = renderScatter({type:'scatter',...config},width,height,theme?getCanonicalTheme(theme):undefined);
    const assembled = figure({width,height,theme,surfacePolicy:'transparent-auto-v1'}).scatter(config).render();
    assert.ok(assembled.includes(svg), 'built figure embeds the exact source-renderer viewport');
    save(`${theme??'legacy'}-${name}-figure.svg`,assembled);
    for (const scale of [1,2]) await containment(`${theme??'legacy'}-${name}`,svg,width,height,scale);
  });
}

test('negative control proves the raster check detects the old endpoint clipping', async () => {
  const old = outer('<circle cx="290" cy="10" r="15" fill="#051C2C" opacity="0.7"/>',300,200);
  await assert.rejects(() => containment('negative-control',old,300,200,1), /unclipped ink outside panel/);
  save('old-clipping-negative-control.svg',old);
  save('old-clipping-negative-control.png',(await decode(old)).toBuffer('image/png'));
});

for (const theme of [undefined,'sage','sage-dark']) {
  test(`${theme??'legacy'}: actual multi-panel output retains its ink and transparent gap`, async () => {
    const report = figure({width:336,height:160,title:'Panels',gap:16,columns:2,theme,surfacePolicy:'transparent-auto-v1'})
      .scatter({points:corners(45)}).scatter({points:corners(45),yAxis:true});
    const svg = report.render();
    save(`${theme??'legacy'}-composition.svg`,svg);
    const image = await decode(svg);
    save(`${theme??'legacy'}-composition.png`,image.toBuffer('image/png'));
    const panels = [...svg.matchAll(/<svg xmlns[^>]*width="160" height="120"[^>]*>(.*?)<\/svg>/g)];
    assert.equal(panels.length,2);
    for (let i=0;i<panels.length;i++) await containment(`${theme??'legacy'}-panel-${i}`,outer(panels[i][1],160,120),160,120,2);
    const pixels=image.getContext('2d').getImageData(160,40,16,120).data;
    assert.equal([...pixels].filter((v,i)=>i%4===3&&v!==0).length,0,'gap has no leaked ink');
  });
}

// Fractional panels are kept as nested viewports in a larger integer canvas,
// preserving their subpixel positions instead of coercing the viewport size.
test('fractional panel edges and translated compositions retain all raster ink', async () => {
  const reports = [
    ['fractional-width', figure({width:100.006,height:80}).scatter({points:corners(10)})],
    ['exact-decimal-edge', figure({width:40.01,height:100}).scatter({points:corners(10)})],
    ['fractional-height', figure({width:160,height:100.006}).scatter({points:corners(24)})],
    ['fractional-composition', [10,24,10,24].reduce((f,size)=>f.scatter({points:corners(size)}),
      figure({width:336.012,height:296.012,title:'Panels',columns:2,gap:16}))],
  ];
  for (const [name,report] of reports) for(const scale of [1,2]) {
    const generated = report.render();
    const clipped = outer(`<g transform="translate(16,16)">${content(generated)}</g>`,380,340,scale);
    // The first root match includes all content; unwrap inner viewports on the
    // root's content separately so the outer canvas itself is unchanged.
    const reference = outer(`<g transform="translate(16,16)">${content(generated).replace(/<svg\b[^>]*>(.*?)<\/svg>/g,'<g>$1</g>')}</g>`,380,340,scale);
    const actual = await decode(clipped), expected = await decode(reference);
    const a = actual.getContext('2d').getImageData(0,0,actual.width,actual.height).data;
    const b = expected.getContext('2d').getImageData(0,0,expected.width,expected.height).data;
    // A fractional SVG viewport changes librsvg/Cairo edge coverage by one
    // alpha level. Do not mistake that for lost geometry, or assert byte parity.
    // Integer cases above remain exact; normal tests check decimal bounds exactly.
    let differingPixels = 0, alphaDifferences = 0, maxAlphaDifference = 0;
    for (let i=3;i<a.length;i+=4) {
      if (a[i]!==b[i] || a[i-1]!==b[i-1] || a[i-2]!==b[i-2] || a[i-3]!==b[i-3]) differingPixels++;
      const difference = Math.abs(a[i]-b[i]);
      if (difference) alphaDifferences++;
      maxAlphaDifference = Math.max(maxAlphaDifference,difference);
      assert.ok(difference<=1, `${name}: fractional edge loses more than one alpha level`);
      if (b[i]>1) assert.ok(a[i]>0, `${name}: visible reference ink must remain`);
    }
    const png = actual.toBuffer('image/png');
    measurements.push({name,scale,differingPixels,alphaDifferences,maxAlphaDifference,sha256:hash(png)});
    save(`${name}-${scale}x.svg`,clipped);save(`${name}-${scale}x.png`,png);
  }
});

test('fractional old-geometry negative control exceeds the alpha1 allowance', async () => {
  const oldCircle = '<circle cx="90.01" cy="10" r="15" fill="#051C2C" opacity="0.7"/>';
  const old = outer(`<g transform="translate(16,16)">${outer(oldCircle,100.006,80)}</g>`,160,120,2);
  const reference = outer(`<g transform="translate(16,16)">${oldCircle}</g>`,160,120,2);
  const actual = await decode(old), expected = await decode(reference);
  const a=actual.getContext('2d').getImageData(0,0,actual.width,actual.height).data;
  const b=expected.getContext('2d').getImageData(0,0,expected.width,expected.height).data;
  let maxAlphaDifference=0, differingPixels=0;
  for(let i=3;i<a.length;i+=4) {
    if(a[i]!==b[i]) differingPixels++;
    maxAlphaDifference=Math.max(maxAlphaDifference,Math.abs(a[i]-b[i]));
  }
  assert.ok(maxAlphaDifference>1,'the original clipping must fail the fractional allowance');
  // Radius10's old 0.004px overflow is decided by exact geometry, not a pixel
  // tolerance: its emitted right edge100.01 is beyond viewport100.006.
  assert.ok(90.01+10>100.006);
  measurements.push({name:'fractional-negative-control',differingPixels,maxAlphaDifference});
  save('fractional-negative-control.svg',old);
  save('fractional-negative-control.png',actual.toBuffer('image/png'));
});

after(() => {
  save('measurements.json',JSON.stringify({
    browserAcceptance:false,
    versions:{node:process.version,canvas:canvas.version,rsvg:canvas.rsvgVersion,cairo:canvas.cairoVersion},
    bundles:['dist/svg.js','dist/plot-ts.js'].map(path=>({path,sha256:hash(readFileSync(path))})),
    nativeBinding:{sha256:hash(readFileSync('node_modules/canvas/build/Release/canvas.node'))},
    measurements,
  },null,2)+'\n');
  save('artifact-manifest.json',JSON.stringify({artifacts},null,2)+'\n');
});
