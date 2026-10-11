'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const C=require('../car-renderer.js');
const palette=['#ff7658','#68d3c5','#f0bd69','#a6b4ff','#d7a4dd','#8ccf8b','#f5df91','#77b7dc'];
function canvas(width=300,height=120){
  const calls=[],result={width,height,calls,getBoundingClientRect:()=>({width:300,height:120})};
  const ctx={canvas:result};
  for(const method of ['save','restore','translate','rotate','scale','setTransform','clearRect','drawImage','putImageData','beginPath','roundRect','fill','fillRect','moveTo','lineTo','quadraticCurveTo','closePath','ellipse','arc','stroke'])ctx[method]=(...args)=>calls.push([method,...args]);
  ctx.getImageData=(x,y,w,h)=>{const data=new Uint8ClampedArray(w*h*4);for(let i=0;i<data.length;i+=4){data[i]=data[i+1]=data[i+2]=200;data[i+3]=i===0?0:255;}return {data,width:w,height:h};};
  result.getContext=()=>ctx;return result;
}
const car=()=>({id:9,alive:true,steer:.25,outputs:[.3,.0,.8],genome:[.1,.2],brain:{activity:[.3,.4]},vehicle:{steeringAngle:.12,speedMps:4.4},x:33,y:42,heading:1,scale:.3});
const renderer=()=>new C.Renderer({makeCanvas:canvas,loadImage:async()=>({width:100,height:50})});
test('Car sprite LOD uses screen size with explicit limits',()=>{
  assert.equal(C.detailLevel(7.99),'dot');assert.equal(C.detailLevel(8),64);assert.equal(C.detailLevel(48),64);assert.equal(C.detailLevel(48.1),256);assert.equal(C.detailLevel(160),256);assert.equal(C.detailLevel(161),512);
});
test('Sprite trim derives natural alpha, not guessed background geometry',()=>{
  const data=new Uint8ClampedArray(4*3*4);for(const [x,y]of [[1,1],[2,1],[1,2],[2,2]])data[(y*4+x)*4+3]=255;
  assert.deepEqual(C.alphaBounds(data,4,3),{x:1,y:1,width:2,height:2,opaque:4,transparent:8,pixels:12});
});
test('Empty cutout fails explicitly instead of becoming an invisible car',()=>{
  assert.throws(()=>C.alphaBounds(new Uint8ClampedArray(64),4,4),/senza carrozzeria/);
});
test('Visual controls use actual physical steering and exclusive brake output',()=>{
  const c=car(),before=JSON.stringify(c);assert.equal(C.displayState(c).steering,.12);assert.equal(C.displayState(c).braking,true);
  assert.equal(JSON.stringify(c),before);c.vehicle.steeringAngle=2;assert.equal(C.displayState(c).steering,.58);
  c.alive=false;assert.equal(C.displayState(c).braking,false);assert.equal(C.displayState({steer:-.5,outputs:[0,1,0]}).steering,-.29);
});
test('Far zoom draws only colour dots, not a full sprite or tyres',async()=>{
  const r=renderer();await r.load('test.png',palette);const target=canvas();assert.equal(r.drawLocal(target.getContext('2d'),car(),{pixelLength:4}),'dot');
  assert.equal(target.calls.filter(c=>c[0]==='drawImage').length,0);assert.equal(target.calls.filter(c=>c[0]==='rotate').length,0);assert.equal(r.status().draws.dot,1);
});
test('Unavailable asset retains an explicit working fallback',async()=>{
  const r=new C.Renderer({makeCanvas:canvas,loadImage:async()=>{throw Error('offline test');}});
  const status=await r.load('missing.png');assert.equal(status.state,'fallback');assert.equal(status.error,'offline test');
  assert.equal(r.drawLocal(canvas().getContext('2d'),car(),{pixelLength:64}),'fallback');
});
test('Load prepares at most 8 colours and 24 mip canvases below 6 MiB',async()=>{
  const r=renderer();await r.load('test.png',[...palette,'#abcdef']);const s=r.status();
  assert.equal(s.state,'ready');assert.equal(s.colours,8);assert.equal(s.cacheEntries,24);assert.ok(s.cacheBytes<6*1024*1024);assert.equal(s.source.width,100);assert.ok(s.source.bounds.transparent>0);
});
test('Repeated 100-agent draws reuse prepared materials and preserve all inputs',async()=>{
  const r=renderer();await r.load('test.png',palette);const c=car(),before=JSON.stringify(c),target=canvas();
  Object.freeze(c.vehicle);Object.freeze(c.outputs);Object.freeze(c.genome);Object.freeze(c.brain.activity);Object.freeze(c.brain);Object.freeze(c);
  for(let i=0;i<300;i++)r.drawLocal(target.getContext('2d'),c,{color:palette[i%8],pixelLength:72});
  assert.equal(JSON.stringify(c),before);assert.equal(r.status().builds,8);assert.equal(r.status().draws.sprite,300);assert.equal(r.status().cacheEntries,24);
});
test('Colour cache disposes the oldest pixels rather than growing indefinitely',async()=>{
  const r=renderer();await r.load('test.png',palette);const first=r.cache.get(palette[0]+':512');
  r.drawLocal(canvas().getContext('2d'),car(),{color:'#abcdef',pixelLength:250});
  assert.equal(r.status().colours,8);assert.equal(r.status().cacheEntries,24);assert.equal(first.width,0);assert.equal(first.height,0);assert.ok(r.status().cacheBytes<6*1024*1024);
});
test('Preview caps DPR, skips hidden surfaces and remains observational',async()=>{
  const r=renderer();await r.load('test.png',palette);const target=canvas(),c=car(),before=JSON.stringify(c);
  assert.equal(r.drawPreview(target,c,palette[0],4),true);assert.equal(target.width,600);assert.equal(target.height,240);assert.equal(JSON.stringify(c),before);
  target.getBoundingClientRect=()=>({width:0,height:0});assert.equal(r.drawPreview(target,c),false);
});
test('Front tyres track physical radians, rear tyres are not steered',()=>{
  const r=renderer(),c=car(),target=canvas();r.drawLocal(target.getContext('2d'),c,{pixelLength:250});
  assert.deepEqual(target.calls.filter(c=>c[0]==='rotate').map(c=>c[1]),[.12,.12]);assert.equal(target.calls.filter(c=>c[0]==='stroke').length,1);
  c.outputs[2]=0;const idle=canvas();r.drawLocal(idle.getContext('2d'),c,{pixelLength:250});assert.equal(idle.calls.filter(c=>c[0]==='stroke').length,0);
});
test('Body drawing footprint matches unchanged published SI ratio; no compute dependency',async()=>{
  const r=renderer();await r.load('test.png',palette);const target=canvas();r.drawLocal(target.getContext('2d'),car(),{pixelLength:200});
  const call=target.calls.find(c=>c[0]==='drawImage');assert.deepEqual(call.slice(2),[-12,-12*C.WIDTH_RATIO,24,24*C.WIDTH_RATIO]);
  const source=fs.readFileSync(require.resolve('../car-renderer.js'),'utf8');assert.doesNotMatch(source,/FlySim|desktopCompute|Math\.random|fetch\(/);
});
