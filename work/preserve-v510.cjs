'use strict';
// A recoverable source baseline plus hashes for existing releases and saves.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),out=path.join(root,'work','baseline-v510');
const digest=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{const p=path.join(dir,e.name);return e.isDirectory()?walk(p):[p];});}
if(process.argv.includes('--verify')){
  const manifest=JSON.parse(fs.readFileSync(path.join(out,'manifest.json'))),changed=Object.entries(manifest.protected).filter(([f,h])=>!fs.existsSync(path.join(root,f))||digest(path.join(root,f))!==h).map(([f])=>f);
  console.log(JSON.stringify({protectedFiles:Object.keys(manifest.protected).length,changed,passed:changed.length===0},null,2));process.exitCode=changed.length?1:0;
}else{
  if(fs.existsSync(out))throw Error('Baseline exists; do not replace it.');
  fs.mkdirSync(out,{recursive:true});
  const source=['package.json','package-lock.json',...walk(path.join(root,'outputs')).filter(p=>/\.(js|html|css)$/.test(p)&&!p.includes(path.sep+'tests'+path.sep)).map(p=>path.relative(root,p)),...walk(path.join(root,'desktop')).filter(p=>p.endsWith('.cjs')).map(p=>path.relative(root,p))];
  const protectedFiles=[...walk(path.join(root,'outputs')).filter(p=>p.endsWith('.malecns-save')),...fs.readdirSync(root).filter(n=>n.startsWith('dist-')).flatMap(n=>walk(path.join(root,n)).filter(p=>p.endsWith('.exe'))),...['connectome.json','connectome-full.json','connectome-full.bin','circuits.json','circuits.js','curbs.js'].map(f=>path.join(root,'outputs','data',f)),path.join(root,'outputs','vehicle-992.js')];
  for(const f of source){const dest=path.join(out,f);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(root,f),dest,fs.constants.COPYFILE_EXCL);}
  const manifest={createdAt:new Date().toISOString(),source:Object.fromEntries(source.map(f=>[f,digest(path.join(root,f))])),protected:Object.fromEntries(protectedFiles.map(f=>[path.relative(root,f),digest(f)]))};
  fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2));console.log(JSON.stringify({sourceFiles:source.length,protectedFiles:protectedFiles.length,baseline:out}));
}
