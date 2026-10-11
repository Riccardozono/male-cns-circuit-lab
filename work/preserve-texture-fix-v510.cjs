'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),manifest=path.join(root,'work/pre-texture-fix-v510/protected.json');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const walk=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(p,e.name)):[path.join(p,e.name)]);
if(process.argv.includes('--verify')){
  const record=JSON.parse(fs.readFileSync(manifest)),changed=Object.entries(record.files).filter(([p,h])=>!fs.existsSync(path.join(root,p))||sha(path.join(root,p))!==h).map(([p])=>p);
  console.log(JSON.stringify({passed:!changed.length,files:Object.keys(record.files).length,changed}));process.exitCode=changed.length?1:0;
}else{
  if(fs.existsSync(manifest))throw Error('Do not replace the pre-fix manifest.');
  const previous=JSON.parse(fs.readFileSync(path.join(root,'work/baseline-v510/manifest.json'))),paths=new Set(Object.keys(previous.protected));
  for(const f of ['simulation.js','neural-learning.js','rewards.js','progress-save.js','vehicle-992.js','model-profiles.js','legacy-models.js','full-connectome-loader.js','desktop-state.js','desktop-runtime.js','learning-metrics.js','model-test.js'])paths.add('outputs/'+f);
  for(const name of fs.readdirSync(root).filter(n=>n.startsWith('dist-')))for(const p of walk(path.join(root,name)))if(p.endsWith('.exe')||p.includes(path.join('dist-learning-3d-v510','win-unpacked','resources','app')))paths.add(path.relative(root,p));
  for(const p of walk(path.join(root,'outputs')).filter(p=>p.endsWith('.malecns-save')))paths.add(path.relative(root,p));
  paths.add('outputs/assets/porsche-992-gt3-r-supplied.glb');
  const files=Object.fromEntries([...paths].map(p=>[p,sha(path.join(root,p))]));
  fs.writeFileSync(manifest,JSON.stringify({generatedAt:new Date().toISOString(),appVersion:'5.1.0',boundary:'Visual-only correction. Existing releases, progress, neural graph, training and physical solver must stay unchanged.',files},null,2));
  console.log(JSON.stringify({files:paths.size,manifest}));
}
