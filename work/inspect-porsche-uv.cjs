'use strict';
// Analysis chart of supplied mesh data, not a replacement texture or a remap.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..');
if(!process.versions.electron){const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const child=spawn(require('electron'),[__filename],{cwd:root,env,windowsHide:true,stdio:'inherit'});child.on('exit',code=>process.exitCode=code);}
else{
  const {app,BrowserWindow}=require('electron');
  app.whenReady().then(async()=>{
    const b=fs.readFileSync(path.join(root,'outputs/assets/porsche-992-gt3-r-supplied.glb')),length=b.readUInt32LE(12),j=JSON.parse(b.subarray(20,20+length)),bin=b.subarray(28+length);
    const read=i=>{const a=j.accessors[i],v=j.bufferViews[a.bufferView],n={SCALAR:1,VEC2:2,VEC3:3}[a.type],size=a.componentType===5126||a.componentType===5125?4:2,stride=v.byteStride||n*size,method={5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'}[a.componentType],values=[];for(let k=0;k<a.count;k++)for(let c=0;c<n;c++)values.push(bin[method]((v.byteOffset||0)+(a.byteOffset||0)+k*stride+c*size));return values;};
    const paint=j.materials.findIndex(m=>m.name==='EXT_Carpaint_Inst'),png=fs.readFileSync(path.join(root,'outputs/assets/porsche-992-gt3-r-decals-source.png')).toString('base64'),colors=['#00ffff','#ff40ff','#40ff40'],plots=[],summary=[];
    for(const mesh of j.meshes.filter(m=>m.primitives.some(p=>p.material===paint))){
      const p=mesh.primitives.find(p=>p.material===paint),uv=read(p.attributes.TEXCOORD_0),indices=read(p.indices),u=[],v=[];
      for(let i=0;i<uv.length;i+=2){u.push(uv[i]);v.push(uv[i+1]);}
      const channels=Object.fromEntries(Object.entries(p.attributes).filter(([k])=>k.startsWith('TEXCOORD_')).map(([key,index])=>{const values=read(index),xs=[],ys=[];let different=0;for(let i=0;i<values.length;i+=2){xs.push(values[i]);ys.push(values[i+1]);if(values[i]!==uv[i]||values[i+1]!==uv[i+1])different++;}return [key,{min:[Math.min(...xs),Math.min(...ys)],max:[Math.max(...xs),Math.max(...ys)],differentFromUv0:different}];}));
      summary.push({mesh:mesh.name,min:[Math.min(...u),Math.min(...v)],max:[Math.max(...u),Math.max(...v)],vertices:uv.length/2,channels});
      const edges=new Map();for(let i=0;i<indices.length;i+=3)for(const [a,c]of [[indices[i],indices[i+1]],[indices[i+1],indices[i+2]],[indices[i+2],indices[i]]]){const x=uv.slice(a*2,a*2+2),y=uv.slice(c*2,c*2+2),aa=x.map(v=>v.toFixed(6)).join(','),bb=y.map(v=>v.toFixed(6)).join(','),key=aa<bb?aa+':'+bb:bb+':'+aa;if(edges.has(key))edges.get(key).count++;else edges.set(key,{count:1,points:[...x,...y]});}
      plots.push([...edges.values()].filter(e=>e.count===1).map(e=>e.points));
    }
    const variants=[['identity',(u,v)=>[u,v]],['flip V',(u,v)=>[u,1-v]],['flip U',(u,v)=>[1-u,v]],['rotate 180',(u,v)=>[1-u,1-v]],['transpose',(u,v)=>[v,u]],['rotate 90',(u,v)=>[1-v,u]],['rotate -90',(u,v)=>[v,1-u]],['opposite transpose',(u,v)=>[1-v,1-u]]];
    const chart=(transform,label)=>{const point=(u,v)=>transform(u,v-1).map(a=>a*4096).join(',');return `<div><h2>${label}</h2><svg width="480" height="480" viewBox="0 0 4096 4096"><image width="4096" height="4096" href="data:image/png;base64,${png}"/>${plots.map((edges,i)=>`<path fill="none" stroke="${colors[i]}" stroke-width="8" d="${edges.map(e=>`M${point(e[0],e[1])}L${point(e[2],e[3])}`).join(' ')}"/>`).join('')}</svg></div>`;};
    const win=new BrowserWindow({show:false,width:2000,height:1100,webPreferences:{sandbox:true}});
    await win.loadURL('about:blank');
    const html=`<style>body{margin:12px;background:#181818;color:#fff;font:16px sans-serif;display:grid;grid-template-columns:repeat(4,480px);gap:12px}h2{font-size:18px}</style>${variants.map(([label,transform])=>chart(transform,label)).join('')}<img style="display:none" src="data:image/png;base64,${png}">`;
    await win.webContents.executeJavaScript('document.body.innerHTML='+JSON.stringify(html));
    await win.webContents.executeJavaScript('Promise.all([...document.images].map(i=>i.decode())).then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))');
    const capture=await win.webContents.capturePage(),out=path.join(root,'work/textures-diagnosis-v510');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'uv-correspondence.png'),capture.toPNG());fs.writeFileSync(path.join(out,'uv-correspondence.json'),JSON.stringify({source:'Original GLB TEXCOORD_0 and exact ZIP decals.png',paintMeshes:summary},null,2));
    console.log(JSON.stringify(summary,null,2));win.destroy();app.quit();
  }).catch(e=>{console.error(e.message);app.exit(1);});
}
