'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
async function run(window,{root,getState}){
  const wc=window.webContents,js=code=>wc.executeJavaScript(code,true),wait=ms=>new Promise(r=>setTimeout(r,ms));
  for(let i=0;i<200;i++){if(await js('Boolean(globalThis.circuitLab?.sim?.engine&&!document.querySelector("main").inert)'))break;await wait(150);}
  window.setSize(1440,1200);await js('showWorkspace("split")');await wait(800);
  const before=JSON.stringify(getState().cars[0]);
  const result=await js(`(()=>{
    const a=circuitLab.atlas,g=a.gl;
    const status=()=>({visible:a.visible,dirty:a.dirty,lastPaint:a.lastPaint,metrics:a.metrics,canvas:[a.canvas.width,a.canvas.height],nodes:a.nodes.length,finite:a.pointData.every(Number.isFinite),contextLost:Boolean(a.contextLost)});
    const pixels=()=>{g.finish();const p=new Uint8Array(a.canvas.width*a.canvas.height*4);g.readPixels(0,0,a.canvas.width,a.canvas.height,g.RGBA,g.UNSIGNED_BYTE,p);let bright=0;for(let i=0;i<p.length;i+=4)if(Math.max(p[i],p[i+1],p[i+2])>50)bright++;return {bright,error:g.getError()};};
    const automatic=status(),automaticPixels=pixels();a.visible=true;a.resize();a.render();
    return {automatic,automaticPixels,explicit:status(),explicitPixels:pixels()};
  })()`);
  const unchanged=before===JSON.stringify(getState().cars[0]),report={...result,pausedStateUnchanged:unchanged,
    boundary:'Read-only framebuffer diagnostic in a hidden native test window. Explicit redraw is diagnostic only, not a neural or physics step.'};
  const out=path.join(root,'.impeccable/review/neural-sacl/context-atlas-audit');await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'verification.json'),JSON.stringify(report,null,2));
  console.log('CONTEXT_ATLAS_PROBE '+JSON.stringify(report));return {passed:unchanged&&result.explicitPixels.bright>100};
}
module.exports={run};
