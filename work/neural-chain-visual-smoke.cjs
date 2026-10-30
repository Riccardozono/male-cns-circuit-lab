'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
async function run(window,{root,getCoordinator}){
  const out=path.join(root,'.impeccable/review/neural-sacl/chain-training-ui-visual-confirmation');await fs.mkdir(out,{recursive:false});const wc=window.webContents,js=code=>wc.executeJavaScript(code,true),wait=ms=>new Promise(r=>setTimeout(r,ms)),checks=[],errors=[];let captures=[];
  const until=async(fn,label)=>{const start=Date.now();while(!await fn()){if(Date.now()-start>45000)throw Error('Timeout '+label);await wait(100);}};
  const check=(name,passed,detail=null)=>{checks.push({name,passed:Boolean(passed),detail});if(!passed)throw Error(name+': '+JSON.stringify(detail));};
  wc.on('console-message',detail=>{if(detail.level==='error'||detail.level===3)errors.push(detail.message);});
  const capture=async(name,theme,view,camera)=>{
    await until(()=>js(`document.documentElement.dataset.theme===${JSON.stringify(theme)}&&document.getElementById('visual-stage').dataset.view===${JSON.stringify(view)}&&document.getElementById('camera-select').value===${JSON.stringify(camera)}&&!document.querySelector('main').inert&&!document.getElementById('toggle-run').disabled`),'actual theme/camera/view/idle DOM');
    await js('refresh(true);resize();renderDirty=true;render();new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');await wait(450);
    const dom=await js('({theme:document.documentElement.dataset.theme,view:document.getElementById("visual-stage").dataset.view,camera:document.getElementById("camera-select").value,run:document.getElementById("run-state").textContent,inert:document.querySelector("main").inert,overflow:document.documentElement.scrollWidth>innerWidth+2,firstPerson:!document.getElementById("first-person-note").hidden,width:innerWidth,height:innerHeight,bodyBackground:getComputedStyle(document.body).backgroundColor})');
    const bytes=(await wc.capturePage()).toPNG();await fs.writeFile(path.join(out,name),bytes);captures.push({name,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),dom});check(name+' actual state is coherent and has no page overflow',dom.theme===theme&&dom.view===view&&dom.camera===camera&&!dom.inert&&!dom.overflow&&dom.run==='IN PAUSA'&&dom.firstPerson===(camera==='first-person'),dom);
  };
  try{
    await until(()=>js('Boolean(globalThis.circuitLab?.sim?.engine&&!document.querySelector("main").inert&&!progressBusy)'),'startup');window.showInactive();window.setSize(1500,1000);
    const before=JSON.stringify(getCoordinator().snapshot().cars);check('Actual fresh default is16 paused zero-time agents',!getCoordinator().running&&getCoordinator().population===16&&getCoordinator().snapshot().cars.every(c=>c.lifetime===0));
    await js('MaleCNSTheme.controller.setTheme("light");showWorkspace("circuit");cameraSelect.value="follow";cameraSelect.dispatchEvent(new Event("change",{bubbles:true}));window.scrollTo(0,0)');await capture('desktop-light.png','light','circuit','follow');
    await js('MaleCNSTheme.controller.setTheme("dark");showWorkspace("split");cameraSelect.value="first-person";cameraSelect.dispatchEvent(new Event("change",{bubbles:true}));window.scrollTo(0,0)');await capture('split-dark-driver.png','dark','split','first-person');
    window.setSize(980,900);await capture('narrow-dark.png','dark','split','first-person');window.setSize(740,900);await capture('minimum-dark.png','dark','split','first-person');
    check('Visual tests never step the paused physics or neural state',before===JSON.stringify(getCoordinator().snapshot().cars));check('No renderer errors',errors.length===0,errors);
    const report={passed:true,phase:'finished',checks,captures,errors,boundary:'Second and final bounded visual inspection. Fresh actual app, window shown inactive for compositor frames; DOM theme/view/camera/idle state and two animation frames are awaited before native capture. Earlier recovery screenshots sampled preceding frames and are preserved as diagnostics, not used to prove dark/split identity. No application/inference/save source changes or training advancement.'};await fs.writeFile(path.join(out,'verification.json'),JSON.stringify(report,null,2));return report;
  }catch(error){await fs.writeFile(path.join(out,'failed.json'),JSON.stringify({passed:false,checks,captures,errors,error:error.stack},null,2));throw error;}finally{await getCoordinator()?.close();}
}
module.exports={run};
