/** Native-only log release gate. Build first. Bounded optional evidence, no browser. */
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {figure,CANONICAL_THEME_NAMES,SURFACE_POLICIES} from '../dist/svg.js';
const fixtures=JSON.parse(readFileSync(new URL('./fixtures/svg-scaled-axes.json',import.meta.url),'utf8'));
const {createCanvas,loadImage}=createRequire(import.meta.url)('canvas');
const rsvg=process.env.PLOT_TS_RSVG_CONVERT??'rsvg-convert';
const rsvgVersion=execFileSync(rsvg,['--version'],{encoding:'utf8'}).trim();
const evidence=process.env.PLOT_TS_SCALED_EVIDENCE_DIR,measurements=[],artifacts=[];
if(evidence)mkdirSync(evidence,{recursive:true});let retained=0;
const hash=b=>createHash('sha256').update(b).digest('hex');
const region=(canvas,x,y,w,h)=>canvas.getContext('2d').getImageData(x,y,w,h).data;
const save=(name,bytes)=>{if(!evidence)return;retained+=Buffer.byteLength(bytes);assert.ok(retained<2*1024*1024);writeFileSync(join(evidence,name),bytes);artifacts.push({name,bytes:Buffer.byteLength(bytes),sha256:hash(bytes)});};
async function decode(bytes){const image=await loadImage(bytes),canvas=createCanvas(image.width,image.height);canvas.getContext('2d').drawImage(image,0,0);return canvas;}
async function raster(svg,name){assert.doesNotMatch(svg,/NaN|Infinity|undefined/);const png=execFileSync(rsvg,['--format=png'],{input:svg,timeout:20000,maxBuffer:2*1024*1024});if(name){save(name+'.svg',svg);save(name+'.png',png);}return decode(png);}
const points=(svg,method)=>method==='scatter'?[...svg.matchAll(/<circle[^>]* cx="([^"]+)" cy="([^"]+)"/g)].map(m=>m.slice(1).map(Number)):svg.match(/<path d="M([^"]+)" fill="none"/)[1].split(' L').map(p=>p.split(',').map(Number));
function assertInk(canvas,x,y){const p=region(canvas,Math.round(x)-2,Math.round(y)-2,5,5);let found=false;for(let i=0;i<p.length;i+=4)if(p[i]<15&&p[i+1]<50&&p[i+2]<65&&p[i+3]>100)found=true;assert.ok(found,`native mark ink near (${x},${y})`);}

test('six real semilog/loglog line/scatter fixtures retain equal-decade geometry and native pixels',async()=>{
 for(const fixture of fixtures){const f=figure({width:600,height:360})[fixture.method](fixture.chart),svg=f.render(),canvas=await raster(svg,fixture.name);
  const marks=points(svg,fixture.method);assert.equal(marks.length,4);
  for(let axis=0;axis<2;axis++)for(let i=1;i<3;i++)assert.ok(Math.abs((marks[i][axis]-marks[0][axis])/(marks[3][axis]-marks[0][axis])-i/3)<0.0001);
  for(const [x,y] of marks)assertInk(canvas,x,y);
  if(fixture.method==='line')for(let i=1;i<4;i++)assertInk(canvas,(marks[i-1][0]+marks[i][0])/2,(marks[i-1][1]+marks[i][1])/2);
  // node-canvas consumes the actual SVG too; this is native rasterization, not a new chart API.
  const direct=await decode(Buffer.from(svg));for(const [x,y] of marks)assertInk(direct,x,y);
  assert.equal(f.renderFrame(1600),svg);assert.equal(f.renderFrame(0,{reducedMotion:true}),svg);
  measurements.push({name:fixture.name,width:canvas.width,height:canvas.height,marks,rgbaSha256:hash(region(canvas,0,0,600,360)),directCanvasRgbaSha256:hash(region(direct,0,0,600,360))});
 }
});
test('all 14 canonical themes and three surfaces preserve native log line/scatter rendering',async()=>{
 let cases=0;for(const theme of [undefined,...CANONICAL_THEME_NAMES])for(const surfacePolicy of SURFACE_POLICIES)for(const fixture of [fixtures[2],fixtures[5]]){
  const f=figure({width:600,height:360,...(theme?{theme}:{}),surfacePolicy})[fixture.method](fixture.chart),svg=f.render(),canvas=await raster(svg);
  assert.equal(canvas.width,600);assert.equal(canvas.height,360);assert.match(svg,/data-plot-scale="log10"/);
  if(surfacePolicy==='transparent-auto-v1')assert.equal(region(canvas,599,359,1,1)[3],0);cases++;
 }assert.equal(cases,90);measurements.push({name:'theme-surface-native-family-matrix',cases});
});
test('large logarithmic scatter markers leave guide bands unchanged throughout native entry frames',async()=>{
 const f=figure({width:600,height:360}).scatter({...fixtures[5].chart,points:fixtures[5].chart.points.map(p=>({...p,size:25.01}))});
 const svg=f.render(),final=await raster(svg,'large-loglog-final');const yRule=Number(svg.match(/data-plot-axis="y"[\s\S]*?<line x1="([^"]+)"/)[1]),xRule=Number(svg.match(/data-plot-axis="x"[\s\S]*?<line[^>]*y1="([^"]+)"/)[1]);
 const bands=[[0,0,Math.floor(yRule),360],[0,Math.ceil(xRule),600,360-Math.ceil(xRule)],[0,0,600,30]];
 for(const t of [0,150,300,0]){const frame=await raster(f.renderFrame(t),t===0||t===150?'large-loglog-'+t+'ms':undefined);for(const b of bands)assert.deepEqual(region(frame,...b),region(final,...b));}
 measurements.push({name:'loglog-frame-guides',bands,frames:[0,150,300,0],finalReducedEqual:f.renderFrame(0,{reducedMotion:true})===svg});
});
test('subnormal and full-positive-range native log fixtures retain finite marks',async()=>{
 for(const [name,values] of [['log-subnormal',[Number.MIN_VALUE,2*Number.MIN_VALUE,4*Number.MIN_VALUE]],['log-extreme',[Number.MIN_VALUE,1,Number.MAX_VALUE]]]){
  const svg=figure({width:650,height:360}).scatter({axes:'scaled-axes-v1',xScale:'log10',yScale:'log10',points:values.map(x=>({x,y:x}))}).render(),canvas=await raster(svg,name);
  for(const [x,y] of points(svg,'scatter'))assertInk(canvas,x,y);measurements.push({name,rgbaSha256:hash(region(canvas,0,0,650,360))});
 }
});
after(()=>{if(evidence)writeFileSync(join(evidence,'evidence.json'),JSON.stringify({node:process.version,rsvgVersion,bundleSha256:hash(readFileSync(new URL('../dist/svg.js',import.meta.url))),artifacts,measurements,limitations:['Native SVG and node-canvas/librsvg only; no browser playback or Hub log capability','Font environment and native rasterizer affect pixels']},null,2)+'\n');});
