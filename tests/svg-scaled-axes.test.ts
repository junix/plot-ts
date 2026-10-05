import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { figure, CANONICAL_THEME_NAMES, SURFACE_POLICIES } from '../src/svg/index.js';
import { renderLine, renderScatter, renderColumn, renderHeatmap, renderWaterfall, renderDonut, renderRadar, renderGauge, renderSlope, renderPyramid, type LineChart, type ScatterChart } from '../src/svg/charts.js';
import { makeScaledAxis, positiveLogRatio, logAxisValues } from '../src/svg/scaled-axes.js';
import { validateInput } from '../src/provider/input.js';
import { validateInputV2 } from '../src/provider/input-v2.js';
import { validateFrameInput } from '../src/provider/input-frame.js';
const axes = 'scaled-axes-v1' as const;
const line = (extra: Partial<LineChart> = {}): LineChart => ({type:'line',axes,x:[1,10,100,1000],series:[{y:[1,10,100,1000]}],...extra});
const scatter = (extra: Partial<ScatterChart> = {}): ScatterChart => ({type:'scatter',axes,points:[1,10,100,1000].map(x=>({x,y:x})),...extra});
const output = (c: LineChart | ScatterChart) => c.type === 'line' ? renderLine(c,600,360) : renderScatter(c,600,360);
const domains = (svg: string) => [...svg.matchAll(/data-plot-axis="([xy])" data-domain-min="([^"]+)" data-domain-max="([^"]+)" data-plot-scale="([^"]+)"/g)].map(m=>[m[1],Number(m[2]),Number(m[3]),m[4]]);
const circles = (svg: string) => [...svg.matchAll(/<circle[^>]* cx="([^"]+)" cy="([^"]+)" r="([^"]+)"/g)].map(m=>m.slice(1).map(Number));
const guides = (svg: string) => svg.slice(svg.indexOf('<g data-plot-axes='));

test('fixed log kernel agrees with an independent 180-digit exact-binary Decimal reference', () => {
 const ref=JSON.parse(readFileSync(new URL('./fixtures/scaled-axes-reference.json',import.meta.url),'utf8'));
 assert.ok(ref.cases.length>400);
 for(const c of ref.cases){
  const expected=Number(c.logRatio), actual=positiveLogRatio(c.max,c.min);
  assert.ok(Math.abs(actual-expected)<=Math.abs(expected)*2*Number.EPSILON,JSON.stringify({c,actual,expected}));
  const f=makeScaledAxis('log10',[c.min,c.max]).fraction(c.value);
  assert.ok(Math.abs(f-Number(c.fraction))<=4*Number.EPSILON,JSON.stringify({c,f}));
 }
});
for(const pair of [['log10','linear'],['linear','log10'],['log10','log10'],['linear','linear']] as const) test(`actual ${pair.join('/')} scatter positions use the declared transforms`,()=>{
 const svg=output(scatter({xScale:pair[0],yScale:pair[1]})), marks=circles(svg);
 assert.equal(marks.length,4);assert.deepEqual(domains(svg),[['y',1,1000,pair[1]],['x',1,1000,pair[0]]]);
 for(let axis=0;axis<2;axis++)for(let i=1;i<3;i++){
  const fraction=(marks[i]![axis]!-marks[0]![axis]!)/(marks[3]![axis]!-marks[0]![axis]!);
  const expected=pair[axis]==='log10'?i/3:([1,10,100,1000][i]!-1)/999;
  assert.ok(Math.abs(fraction-expected)<0.0001);
 }
});
test('line and scatter use identical transformed fractions; exact decades are equally spaced',()=>{
 const c=line({xScale:'log10',yScale:'log10'}),svg=output(c);
 const path=svg.match(/<path d="M([^"]+)" fill="none"/)!;
 assert.ok(path);const points=path[1]!.split(' L').map(p=>p.split(',').map(Number));
 for(let axis=0;axis<2;axis++)for(let i=1;i<3;i++)assert.ok(Math.abs((points[i]![axis]!-points[0]![axis]!)/(points[3]![axis]!-points[0]![axis]!)-i/3)<0.0001);
 assert.equal((svg.match(/data-plot-tick-value="10"/g)??[]).length,2);
 assert.equal((svg.match(/data-plot-tick-value="100"/g)??[]).length,2);
});
test('exact observed extents replace zero inclusion/nice bounds only in the new profile',()=>{
 assert.deepEqual(domains(output(line({x:[3,7],series:[{y:[0.001,0.0019]}]}))),[['y',0.001,0.0019,'linear'],['x',3,7,'linear']]);
 const old=output({...line({x:[3,7],series:[{y:[0.001,0.0019]}]}),axes:'numeric-axes-v1'});
 assert.match(old,/data-domain-min="0" data-domain-max="0.002"/);assert.doesNotMatch(old,/data-plot-scale/);
});
test('explicit domains preserve exact endpoints, contain all observations and never clip',()=>{
 const svg=output(scatter({xScale:'log10',yScale:'log10',xDomain:[0.1,10000],yDomain:[0.01,100000]}));
 assert.deepEqual(domains(svg),[['y',0.01,100000,'log10'],['x',0.1,10000,'log10']]);
 for(const field of ['xDomain','yDomain'])for(const domain of [[2,1000],[1,999],[1000,1],[0,1000],[-1,1000],[1,Infinity],[1,NaN],[],[1,2,3],null,'1,1000'])assert.throws(()=>output(scatter({xScale:'log10',yScale:'log10',[field]:domain} as any)),RangeError);
});
test('constant and empty axes retain finite centered truth and declared fallback',()=>{
 for(const value of [Number.MIN_VALUE,1,Number.MAX_VALUE]){
  const svg=output(scatter({xScale:'log10',yScale:'log10',points:[{x:value,y:value}]}));
  assert.deepEqual(domains(svg),[['y',value,value,'log10'],['x',value,value,'log10']]);
  assert.equal((svg.match(/data-plot-tick-value/g)??[]).length,2);
 }
 assert.deepEqual(domains(output(scatter({xScale:'log10',points:[]}))),[['y',0,1,'linear'],['x',1,10,'log10']]);
 assert.deepEqual(domains(output(line({xScale:'log10',yScale:'log10',x:[1,10],series:[{y:[null,null]}]}))),[['y',1,10,'log10'],['x',1,10,'log10']]);
});
test('adjacent/subnormal/extreme positive ranges produce finite contained geometry',()=>{
 for(const pair of [[Number.MIN_VALUE,2*Number.MIN_VALUE],[1,1+Number.EPSILON],[Number.MAX_VALUE/2,Number.MAX_VALUE],[Number.MIN_VALUE,Number.MAX_VALUE]]){
  const svg=output(scatter({xScale:'log10',yScale:'log10',points:pair.map(x=>({x,y:x}))}));
  assert.doesNotMatch(svg,/NaN|Infinity|undefined/);const marks=circles(svg);assert.ok(marks[1]![0]!>marks[0]![0]!);assert.ok(marks[1]![1]!<marks[0]![1]!);
 }
 assert.throws(()=>output(scatter({points:[{x:-Number.MAX_VALUE,y:0},{x:Number.MAX_VALUE,y:1}]})),/linear span/);
});
for(const value of [0,-0,-1,-Number.MIN_VALUE,NaN,Infinity,-Infinity])test(`log observations ${String(value)} reject everywhere, including null-paired X`,()=>{
 for(const c of [line({xScale:'log10',x:[value],series:[{y:[null]}]}),line({yScale:'log10',x:[1],series:[{y:[value]}]}),scatter({xScale:'log10',points:[{x:value,y:1}]}),scatter({yScale:'log10',points:[{x:1,y:value}]})])assert.throws(()=>output(c),/finite.*positive/);
});
test('linear coordinates are strictly finite; only explicit null Y represents missing data',()=>{
 for(const c of [line({x:[1],series:[{y:[undefined as any]}]}),line({x:[1],series:[{y:[NaN]}]}),scatter({points:[{x:NaN,y:1}]}),scatter({points:[{x:1,y:Infinity}]})])assert.throws(()=>output(c),/finite/);
 const svg=output(line({xScale:'log10',yScale:'log10',x:[1,10,100],series:[{y:[1,null,100]}]}));
 assert.equal((svg.match(/<path/g)??[]).length,2);assert.deepEqual(domains(svg),[['y',1,100,'log10'],['x',1,100,'log10']]);
 for(const y of [[1],[1,2,3],[1,0,3]])assert.throws(()=>output(line({x:[1,2],series:[{y}]})),/same length/);
});
test('unsupported options fail explicitly; fields require the new profile',()=>{
 for(const option of [{max:10},{labels:true},{yAxis:false},{xScale:'log'},{yScale:null},{xDomain:{}},{series:[{y:[1,10,100,1000],area:true}]},{series:[{y:[1,10,100,1000],smooth:true}]}])assert.throws(()=>output(line(option as any)),/scaled-axes-v1/);
 for(const old of [undefined,'numeric-axes-v1'])for(const option of [{xScale:'linear'},{yScale:'log10'},{xDomain:[1,1000]},{yDomain:[1,1000]}])assert.throws(()=>output({...line(),axes:old,...option} as any),/requires axes: 'scaled-axes-v1'/);
 for(const renderer of [renderColumn,renderHeatmap,renderWaterfall,renderDonut,renderRadar,renderGauge,renderSlope,renderPyramid])for(const option of [{axes},{xScale:'log10'}])assert.throws(()=>renderer({type:'unsupported',...option} as never,600,360),/scaled-axes-v1|numeric-axes-v1/);
});
test('full units, legends, independent panels and all theme/surface combinations share the profile',()=>{
 for(const theme of [undefined,...CANONICAL_THEME_NAMES])for(const surfacePolicy of SURFACE_POLICIES){
  const f=figure({width:650,height:380,...(theme?{theme}:{}),surfacePolicy}).line(line({xScale:'log10',yScale:'log10',unit:'µg/m³',xUnit:'s',legend:'series-names-v1',series:[{name:'Observed <&>',y:[1,10,100,1000]}]}));
  const svg=f.render();assert.match(svg,/Observed &lt;&amp;&gt;/);assert.match(svg,/µg\/m³/);assert.match(svg,/data-plot-scale="log10"/);
 }
 const mixed=figure({width:1000,height:380,columns:2}).line(line({xScale:'log10'})).scatter(scatter({yScale:'log10'})).render();assert.equal((mixed.match(/data-plot-axes="scaled-axes-v1"/g)??[]).length,2);
});
test('repeated static/HTML/frame renders preserve scales and immutable guide bands',()=>{
 const c=scatter({xScale:'log10',yScale:'log10'}),f=figure({width:600,height:360}).scatter(c),plain=f.render();
 assert.equal(f.renderFrame(1600),plain);assert.equal(f.renderFrame(0,{reducedMotion:true}),plain);assert.ok(f.renderHtml().includes('scaled-axes-v1'));
 for(const time of [0,150,300,0]){const frame=f.renderFrame(time);assert.equal(guides(frame),guides(plain));}
 const g=figure({width:600,height:360}).line(line({xScale:'log10',yScale:'log10'}));assert.equal(g.renderFrame(100),g.render());
 c.points[0]!.x=0;assert.throws(()=>f.render(),/strictly positive/);assert.throws(()=>f.renderFrame(1600),/strictly positive/);
});
test('native scale options remain outside all three closed machine contracts',()=>{
 for(const chart of [line({xScale:'log10'}),scatter({yScale:'log10'}),{...scatter(),axes:'numeric-axes-v1',xScale:'log10'}]){
  assert.throws(()=>validateInput({schema_version:'plot-ts.svg-figure/v1',charts:[chart]}));
  assert.throws(()=>validateInputV2({schema_version:'plot-ts.svg-figure/v2',charts:[chart]}));
  assert.throws(()=>validateFrameInput({schema_version:'plot-ts.svg-frame/v1',frame:{profile:'entry-v1',time_ms:0,reduced_motion:false},charts:[chart]}));
 }
});
test('bounded decade selection keeps exact endpoints and true decimal powers',()=>{
 assert.deepEqual(logAxisValues([1,1000],4),[1,10,100,1000]);assert.deepEqual(logAxisValues([2,8],4),[2,8]);
 for(const intervals of [4,2,1] as const){const values=logAxisValues([Number.MIN_VALUE,Number.MAX_VALUE],intervals);assert.ok(values.length<=intervals+1);assert.equal(values[0],Number.MIN_VALUE);assert.equal(values.at(-1),Number.MAX_VALUE);assert.ok(values.every((v,i)=>!i||v>values[i-1]!));}
 assert.throws(()=>figure({width:100,height:100}).scatter(scatter({xScale:'log10'})).render(),/full ticks and units do not fit/);
});


test('binary exponent transitions stay monotone and never reject a contained near-maximum observation',()=>{
 const b=4.766827154468641e-57,a=1.0195788231247693e-56,next=1.0195788231247695e-56;
 assert.ok(positiveLogRatio(a,b)<=positiveLogRatio(next,b));
 assert.doesNotThrow(()=>output(scatter({xScale:'log10',points:[b,a,next].map((x,y)=>({x,y}))})));
 const bytes=new DataView(new ArrayBuffer(8));
 for(const exponent of [-1022,-1000,-500,-1,0,1,100,500,1000,1023]){
  const boundary=2**exponent;bytes.setFloat64(0,boundary);const bits=bytes.getBigUint64(0);
  for(const denominator of [Number.MIN_VALUE,boundary/2,boundary*0.4675288319017]){
   if(!(denominator>0))continue;let previous=-Infinity;
   for(let offset=-8n;offset<=8n;offset++){
    bytes.setBigUint64(0,bits+offset);const value=bytes.getFloat64(0);if(value<denominator||!Number.isFinite(value))continue;
    const actual=positiveLogRatio(value,denominator);assert.ok(actual>=previous,JSON.stringify({exponent,denominator,value,previous,actual}));previous=actual;
   }
  }
 }
});


test('new-profile per-panel budgets count nulls and reject surplus before logarithm work',()=>{
 const x=Array.from({length:65536},(_,i)=>i+1),y=Array(65536).fill(null);
 assert.doesNotThrow(()=>output(line({xScale:'log10',x,series:[{y}]})));
 assert.doesNotThrow(()=>output(line({x:Array(256).fill(1),series:Array.from({length:256},()=>({y:Array(256).fill(null)}))})));
 assert.doesNotThrow(()=>output(scatter({xScale:'log10',yScale:'log10',points:Array.from({length:65536},()=>({x:1,y:1}))})));
 for(const c of [
  line({x:[...x,65537],series:[]}),line({x:[],series:Array.from({length:257},()=>({y:[]}))}),
  line({x,series:[{y},{y:[null]}]}),scatter({xScale:'log10',points:Array.from({length:65537},()=>({x:0,y:0}))}),
 ]){
  const f=figure({width:600,height:360})[c.type](c as any);
  for(const render of [()=>f.render(),()=>f.renderHtml(),()=>f.renderFrame(1600)])assert.throws(render,/65536|256/);
 }
});
