/** Thirteen bounded correctness witnesses. Baseline c201ba4 failed 11; the final fixes pass all 13. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {figure} from '../../src/svg/index.js';
function tags(svg:string,tag:string):Array<Record<string,string>> {
 return [...svg.matchAll(new RegExp(`<${tag}\\b([^>]*)/>`,'g'))].map(m=>Object.fromEntries([...m[1]!.matchAll(/([\w:-]+)="([^"]*)"/g)].map(a=>[a[1]!,a[2]!])));
}
const finite=(svg:string)=>assert.doesNotMatch(svg,/NaN|Infinity/);
const values=(p:string)=>p.split(/[ ,]+/).map(Number);
test('scatter: singleton and constant x center horizontally',()=>{
 for(const points of [[{x:1,y:2}],[{x:1,y:1},{x:1,y:2}]]) {
  const svg=figure().scatter({points}).render(); finite(svg);
  for(const c of tags(svg,'circle'))assert.equal(Number(c.cx),400);
 }
});
test('heatmap: constant finite domains always have an explicit palette fill',()=>{
 for(const data of [[[2,2,2]],[[0]],[[-1,-1]]]) {
  const svg=figure().heatmap({data}).render(); finite(svg);
  for(const r of tags(svg,'rect'))assert.match(r.fill??'',/^#[0-9a-f]{6}$/i);
 }
});
test('donut: full ring avoids coincident-endpoint single arcs',()=>{
 for(const items of [[{name:'A',value:1}],[{name:'zero',value:0},{name:'A',value:1}]]) {
  const svg=figure().donut({items,labels:false}).render();finite(svg);
  // A general ring path needs at least two nondegenerate arcs for each boundary.
  const nonzero=tags(svg,'path').filter(p=>(p.d?.match(/A/g)??[]).length>=4);
  assert.ok(nonzero.length>0,'single nonzero slice needs a full-circle-safe shape; raster check remains authoritative');
 }
});
for(const input of [[100,100,-100],[-100,-100,100]])test('waterfall: all cumulative endpoints stay in the plot '+input.join(','),()=>{
 const svg=figure().waterfall({categories:['A','B','C'],values:input,labels:false}).render();finite(svg);
 for(const r of tags(svg,'rect')) {
  assert.ok(Number(r.y)>=30-0.01,JSON.stringify(r));
  assert.ok(Number(r.y)+Number(r.height)<=470+0.01,JSON.stringify(r));
 }
});
test('radar: series share axis scale instead of independently normalizing',()=>{
 const svg=figure().radar({axes:[{name:'A'},{name:'B'},{name:'C'}],series:[{values:[1,1,1]},{values:[100,100,100]}]}).render();finite(svg);
 const ps=tags(svg,'polygon');assert.equal(ps.length,2);const small=values(ps[0]!.points!),large=values(ps[1]!.points!);
 const distance=(p:number[])=>Math.hypot(p[0]!-400,p[1]!-250);
 assert.ok(distance(small)<distance(large)/10,'100-fold smaller values must have smaller radial distance');
});
test('stacked bars: all-negative cumulative total stays in plot',()=>{
 const svg=figure().bar({categories:['A'],series:[{values:[-10]},{values:[-20]}],stacked:true,yAxis:true,labels:false}).render();finite(svg);
 for(const r of tags(svg,'rect')) {
  assert.ok(Number(r.y)>=8-0.01,JSON.stringify(r));
  assert.ok(Number(r.y)+Number(r.height)<=476+0.01,JSON.stringify(r));
 }
});
test('stacked bars: positive and negative segments stay on their own side of zero',()=>{
 const svg=figure().bar({categories:['A'],series:[{values:[10]},{values:[-5]}],stacked:true,yAxis:true,labels:false}).render();finite(svg);
 const rects=tags(svg,'rect');const baseline=tags(svg,'line').find(l=>l['stroke-opacity']==='0.16')!;const zero=Number(baseline.y1);
 assert.equal(rects.length,2);assert.ok(Number(rects[0]!.y)+Number(rects[0]!.height)<=zero+0.01,'positive segment crosses zero');
 assert.ok(Number(rects[1]!.y)>=zero-0.01,'negative segment crosses zero');
});
test('radar: inferred maximum permits all-zero input',()=>finite(figure().radar({axes:[{name:'A'},{name:'B'},{name:'C'}],series:[{values:[0,0,0]}]}).render()));
test('gauge: inferred maximum permits zero input',()=>finite(figure().gauge({value:0}).render()));
test('pyramid: all-zero input yields finite zero widths',()=>{
 const svg=figure().pyramid({layers:[{name:'A',value:0},{name:'B',value:0}]}).render();finite(svg);
 for(const r of tags(svg,'rect'))assert.equal(Number(r.width),0);
});
test('control: line empty/allnull/constant/negative stays finite',()=>{
 for(const y of [[],[null,null,null],[1,1,1],[-1,-2,-3]]) finite(figure().line({x:[0,1,2],series:[{y,area:true}],yAxis:true}).render());
});
test('control: explicit positive scales permit gauge/radar zero input',()=>{
 finite(figure().gauge({value:0,max:1}).render());
 finite(figure().radar({axes:[{name:'A',max:1},{name:'B',max:1},{name:'C',max:1}],series:[{values:[0,0,0]}]}).render());
});
