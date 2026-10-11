'use strict';
// Read-only asset/package checks. Only the new JSON evidence file is written.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist-textures-v510'),app=path.join(dist,'win-unpacked','resources','app'),out=path.join(root,'outputs/texture-verification-v510');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
const walk=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(p,e.name)):[path.join(p,e.name)]);
const readGlb=p=>{const bytes=fs.readFileSync(p),length=bytes.readUInt32LE(12);return {bytes,j:JSON.parse(bytes.subarray(20,20+length)),start:28+length};};
const view=(g,i)=>{const v=g.j.bufferViews[i],start=g.start+(v.byteOffset||0);return g.bytes.subarray(start,start+v.byteLength);};
const config=JSON.parse(fs.readFileSync(path.join(root,'package.json'))),checks=[],artifacts=[];
const check=(name,ok,detail)=>checks.push({name,passed:Boolean(ok),detail});
check('App and save version remains exactly 5.1.0',config.version==='5.1.0'&&JSON.parse(fs.readFileSync(path.join(app,'package.json'))).version==='5.1.0');
check('Correction is published in a separate directory',config.build.directories.output==='dist-textures-v510');
const expected=config.build.files.flatMap(p=>p.endsWith('/**/*')?walk(path.join(root,p.slice(0,-5))).map(f=>path.relative(root,f)):p),missing=[],different=[];
for(const f of expected){const p=path.join(app,f);if(!fs.existsSync(p))missing.push(f);else if(f!=='package.json'&&sha(p)!==sha(path.join(root,f)))different.push(f);}
check('All allowlisted files match the current verified source',!missing.length&&!different.length,{files:expected.length,missing,different});
const model=readGlb(path.join(app,'outputs/assets/porsche-992-gt3-r-lod.glb')),old=readGlb(path.join(root,'work/pre-texture-fix-v510/porsche-992-gt3-r-lod.glb')),provenance=JSON.parse(fs.readFileSync(path.join(app,'outputs/assets/porsche-992-gt3-r-provenance.json')));
check('Porsche GLB matches recorded derived SHA-256',digest(model.bytes)===provenance.derivedSha256,{bytes:model.bytes.length,sha256:digest(model.bytes),visualRevision:provenance.visualRevision});
check('All original 34 embedded images are byte-identical',old.j.images.length===34&&model.j.images.length===35&&old.j.images.every((img,i)=>view(old,img.bufferView).equals(view(model,model.j.images[i].bufferView))));
const geometryChanged=[];
for(let i=0;i<old.j.meshes.length;i++){
  const a=old.j.meshes[i],b=model.j.meshes[i];
  if(!b||a.name!==b.name||a.primitives.length!==b.primitives.length){geometryChanged.push(i);continue;}
  for(let k=0;k<a.primitives.length;k++){
    const ap=a.primitives[k],bp=b.primitives[k],attributes=['indices',...Object.keys(ap.attributes)];
    for(const key of attributes){const ai=key==='indices'?ap.indices:ap.attributes[key],bi=key==='indices'?bp.indices:bp.attributes[key],aa=old.j.accessors[ai],ba=model.j.accessors[bi];
      if(!ba||aa.type!==ba.type||aa.componentType!==ba.componentType||aa.count!==ba.count||!view(old,aa.bufferView).equals(view(model,ba.bufferView)))geometryChanged.push(a.name+':'+key);
    }
  }
}
check('All 114 exterior mesh positions, normals, UVs and indices remain byte-identical',old.j.meshes.length===114&&model.j.meshes.length===114&&!geometryChanged.length,{changed:geometryChanged,lods:provenance.lods});
const paint=model.j.materials.findIndex(m=>m.name==='EXT_Carpaint_Inst'),map=model.j.materials[paint].pbrMetallicRoughness.baseColorTexture,image=model.j.images[model.j.textures[map.index].source],png=view(model,image.bufferView);
check('Exact source livery is embedded once and bound to original UV0 with measured V registration',map.texCoord===0&&JSON.stringify(map.extensions.KHR_texture_transform)===JSON.stringify({offset:[0,2],scale:[1,-1]})&&model.j.images.length===35&&model.j.textures.length===35&&digest(png)===provenance.livery.sha256&&digest(png)===sha(path.join(root,'outputs/assets/porsche-992-gt3-r-decals-source.png'))&&png.readUInt32BE(16)===4096&&png.readUInt32BE(20)===4096&&model.j.meshes.filter(m=>m.primitives.some(p=>p.material===paint)).length===3,{livery:provenance.livery});
check('Every model image and buffer is embedded, without remote dependencies',model.j.images.every(i=>i.bufferView!==undefined&&!i.uri)&&model.j.buffers.every(b=>!b.uri));
check('The separate 4K source and heavy reference GLB are not redundantly bundled',!fs.existsSync(path.join(app,'outputs/assets/porsche-992-gt3-r-decals-source.png'))&&!fs.existsSync(path.join(app,'outputs/assets/porsche-992-gt3-r-supplied.glb')));
check('Credits and licensing accompany the derived model',fs.readFileSync(path.join(app,'outputs/assets/PORSCHE-3D-CREDITS.md'),'utf8').includes('textures/decals.png')&&provenance.author.includes('MattDoesBlender')&&provenance.license.includes('CC-BY-NC-SA-4.0'));
const record=JSON.parse(fs.readFileSync(path.join(root,'work/pre-texture-fix-v510/protected.json'))),changed=Object.entries(record.files).filter(([p,h])=>!fs.existsSync(path.join(root,p))||sha(path.join(root,p))!==h).map(([p])=>p);
check('Existing IA, physics, progress and older releases are untouched',!changed.length,{files:Object.keys(record.files).length,changed});
const nativePath=path.join(dist,'win-unpacked','MAL-E CNS Circuit Lab.exe'),native=fs.readFileSync(nativePath),offset=native.readUInt32LE(60);
check('Native Electron payload is a Windows x64 PE',native.readUInt32LE(offset)===0x4550&&native.readUInt16LE(offset+4)===0x8664);
if(!process.argv.includes('--unpacked-only')){
  for(const [name,file,cpu] of [['packaged-3d','ui-smoke.json',false],['packaged-cpu-3d','ui-smoke.json',true],['packaged-progress','progress-smoke.json',false],['portable-3d','ui-smoke.json',false]]){
    const p=path.join(out,name,file),r=fs.existsSync(p)?JSON.parse(fs.readFileSync(p)):null;
    check(name+' native checks passed',r&&r.passed&&r.version==='5.1.0'&&r.forceCpuFallback===cpu&&r.checks.every(c=>c.passed),r?{file:path.relative(root,p),checks:r.checks.length,cpu,generatedAt:r.generatedAt}:null);
  }
  for(const kind of ['portable','setup']){
    const file=`MAL-E-CNS-Circuit-Lab-${kind}-5.1.0-x64.exe`,p=path.join(dist,file),exists=fs.existsSync(p);check(kind+' Windows artifact exists',exists);
    if(exists){const bytes=fs.readFileSync(p),pe=bytes.readUInt32LE(60);check(kind+' has a Windows PE launcher',bytes.readUInt16LE(0)===0x5a4d&&bytes.readUInt32LE(pe)===0x4550,{launcherMachine:bytes.readUInt16LE(pe+4).toString(16),note:'A self-extracting launcher may be x86; the verified native payload is x64.'});artifacts.push({file,bytes:bytes.length,sha256:digest(bytes)});}
  }
}
const report={passed:checks.every(c=>c.passed),generatedAt:new Date().toISOString(),appVersion:'5.1.0',visualRevision:provenance.visualRevision,checks,artifacts,boundary:'Visual-only correction and package/runtime checks. Installer not installed into the user profile; no learning-convergence or speedup claim.'};
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,process.argv.includes('--unpacked-only')?'unpacked-integrity.json':'package-integrity.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:report.passed,checks:checks.length,failed:checks.filter(c=>!c.passed),artifacts},null,2));process.exitCode=report.passed?0:1;
