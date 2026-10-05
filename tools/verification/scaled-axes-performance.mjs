import {figure} from '../../dist/svg.js';
import {performance} from 'node:perf_hooks';
const results=[];
for(const count of [1000,10000,16384,65536])for(const kind of ['line','scatter']){
 const x=Array.from({length:count},(_,i)=>1+i),y=x.map(v=>v*v);
 const chart=kind==='line'?{x,series:[{y}]}:{points:x.map((v,i)=>({x:v,y:y[i]}))};
 const f=figure({width:800,height:500})[kind]({axes:'scaled-axes-v1',xScale:'log10',yScale:'log10',...chart});
 const start=performance.now(),svg=f.render();results.push({count,kind,milliseconds:performance.now()-start,svgBytes:Buffer.byteLength(svg)});
}
console.log(JSON.stringify({node:process.version,results},null,2));
