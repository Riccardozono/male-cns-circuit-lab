'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
async function run(window,{root,info,getCoordinator}){
  const wc=window.webContents,js=s=>wc.executeJavaScript(s,true),wait=ms=>new Promise(r=>setTimeout(r,ms)),out=path.join(root,'.impeccable/review/neural-sacl/grown-training-ui/full-page');await fs.mkdir(out,{recursive:true});
  const started=Date.now();while(!await js('Boolean(globalThis.circuitLab?.circuit3D&&!document.querySelector("main").inert)')){if(Date.now()-started>45000)throw Error('Visual startup timeout');await wait(100);}
  const paused=()=>JSON.stringify(getCoordinator().snapshot().cars),before=paused(),captures=[];
  async function capture(name,width,height){
    window.setSize(width,height);await js('scrollTo(0,0)');await wait(650);
    const size=await js('({width:innerWidth,height:Math.max(innerHeight,document.documentElement.scrollHeight),overflow:document.documentElement.scrollWidth>innerWidth+2})');if(size.overflow)throw Error('Page overflow '+name);
    const shot=await wc.debugger.sendCommand('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,fromSurface:true,clip:{x:0,y:0,width:size.width,height:size.height,scale:1}});await fs.writeFile(path.join(out,name+'.png'),Buffer.from(shot.data,'base64'));captures.push({name,...size});
  }
  try{
    await wait(1200);wc.debugger.attach('1.3');
    await js('showWorkspace("circuit");document.documentElement.dataset.theme==="dark"&&document.getElementById("theme-toggle").click()');await capture('desktop-light',1500,1000);
    await js('document.getElementById("theme-toggle").click();showWorkspace("split");document.getElementById("camera-select").value="first-person";document.getElementById("camera-select").dispatchEvent(new Event("change",{bubbles:true}))');
    await capture('split-dark-driver',1500,1000);await capture('narrow-dark',980,900);await capture('minimum-dark',740,900);
    if(paused()!==before||getCoordinator().population!==16||getCoordinator().running)throw Error('Observers changed paused physics');
    const explanation=await js('({counts:document.getElementById("data-counts").textContent,limits:document.getElementById("source-title").parentElement.querySelectorAll("p")[1].textContent,parameters:circuitLab.sim.learningStats.parameters})');
    if(explanation.parameters!==12||!explanation.counts.includes('12 coefficienti')||!explanation.counts.includes('non è il numero')||explanation.limits.includes('L’evoluzione modifica encoder'))throw Error('Incorrect live learning explanation');
    await js('showWorkspace("circuit");const note=document.getElementById("source-title").parentElement;note.open=true;note.scrollIntoView({block:"center"})');await wait(250);await fs.writeFile(path.join(out,'learning-explanation-fix.png'),(await wc.capturePage()).toPNG());
    const report={passed:true,round:2,reviewDirectedFix:true,captures,explanation,initialCars:16,paused:true,experiment:info().experiment,boundary:'Full-page CDP captures of the actual16-agent paused Windows copy. Review-directed truth-copy correction only, no new visual polish. No invented history or independent UX verdict.'};await fs.writeFile(path.join(out,'verification.json'),JSON.stringify(report,null,2));console.log('GROWN_VISUAL_VERIFIED '+JSON.stringify({passed:true,captures}));return report;
  }finally{if(wc.debugger.isAttached())wc.debugger.detach();await getCoordinator()?.close();}
}
module.exports={run};
