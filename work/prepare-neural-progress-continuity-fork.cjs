'use strict';
const fs=require('node:fs'),path=require('node:path'),I=require('./neural-research-source-identity.cjs'),G=require('./neural-progress-continuity.cjs'),root=path.resolve(__dirname,'..'),
  destination=path.join(root,'.impeccable/experimental-progress-continuity-20261024'),revision='progress-3-local-continuity-private-20261024';
function prepare(){
  if(fs.existsSync(destination))throw Error('Preserve existing continuity fork');
  const sourceHashes=I.collect(['outputs/simulation.js','work/neural-progress-continuity.cjs','work/prepare-neural-progress-continuity-fork.cjs']),
    files=Object.keys(I.collect(['outputs/simulation.js']));
  for(const file of files){const target=path.join(destination,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,file),target);}
  fs.copyFileSync(path.join(root,'work/neural-progress-continuity.cjs'),path.join(destination,'outputs/neural-progress-continuity.cjs'));
  function edit(file,replacements){let text=fs.readFileSync(path.join(destination,file),'utf8').replace(/\r\n/g,'\n');for(const [before,after] of replacements){
    if(text.split(before).length!==2)throw Error('Unique current-source patch required: '+file+' '+before.slice(0,90));text=text.replace(before,after);
  }fs.writeFileSync(path.join(destination,file),text);}
  edit('outputs/simulation.js',[
    ['for(const seg of track.segments) {\n      const p=pointSegment(x,y,seg.a,seg.b);\n      if(p.distance<closest.distance) closest={...p,along:seg.start+p.t*seg.length};',
     'for(let segmentIndex=0;segmentIndex<track.segments.length;segmentIndex++) {\n      const seg=track.segments[segmentIndex],p=pointSegment(x,y,seg.a,seg.b);\n      if(p.distance<closest.distance) closest={...p,along:seg.start+p.t*seg.length,segmentIndex};'],
    ['Rewards.step(track,car,{along:nearest.along,onRoad:', 'Rewards.step(track,car,{along:nearest.along,segmentIndex:nearest.segmentIndex,onRoad:']]);
  edit('outputs/rewards.js',[
    ["  'use strict';",`  'use strict';\n  const Continuity=require('./neural-progress-continuity.cjs'),PRIVATE_CONTINUITY_REVISION='${revision}';`],
    ['Object.freeze([LEGACY_REVISION,PREVIOUS_REVISION,BRAKE_LOCK_REVISION,REVISION])','Object.freeze([LEGACY_REVISION,PREVIOUS_REVISION,BRAKE_LOCK_REVISION,REVISION,PRIVATE_CONTINUITY_REVISION])'],
    ['car.previousGenerationLapTime=Number.isFinite(previousLap)', 'if(revision===PRIVATE_CONTINUITY_REVISION)car.rewardState.segmentIndex=0;\n    car.previousGenerationLapTime=Number.isFinite(previousLap)'],
    ['{along,onRoad=true,collision=false,forwardClearance=Infinity,dt})','{along,segmentIndex=null,onRoad=true,collision=false,forwardClearance=Infinity,dt})'],
    ['const continuous=Number.isFinite(delta)&&Number.isFinite(travelled)&&travelled<=120*ppm*dt+1e-6*ppm&&Math.abs(delta)<=travelled*2+.02*ppm;',
     'const strict=Number.isFinite(delta)&&Number.isFinite(travelled)&&travelled<=120*ppm*dt+1e-6*ppm&&Math.abs(delta)<=travelled*2+.02*ppm;\n    const continuous=strict||(car.rewardRevision===PRIVATE_CONTINUITY_REVISION&&Continuity.localTransition(track,s,car.x,car.y,along,segmentIndex,{onRoad,collision,dt}));'],
    ['if(continuous){s.along=along;car.lastAlong=along;s.invalidSteps=0;}else s.invalidSteps++;',
     'if(continuous){s.along=along;if(car.rewardRevision===PRIVATE_CONTINUITY_REVISION&&Number.isInteger(segmentIndex))s.segmentIndex=segmentIndex;car.lastAlong=along;s.invalidSteps=0;}else s.invalidSteps++;'],
    ['return Object.freeze({REVISION,LEGACY_REVISION,','return Object.freeze({PRIVATE_CONTINUITY_REVISION,REVISION,LEGACY_REVISION,']]);
  const forkEntries=files.map(file=>path.relative(root,path.join(destination,file)).replaceAll('\\','/')),
    manifest={format:'private-current-continuity-fork-v1',created:new Date().toISOString(),revision,appVersion:'5.6.0',sourceHashes,
      forkHashes:I.collect(forkEntries),boundary:'Separate native research fork. Existing R3/R4/R5/R6 semantics retained; only the named private revision enables verified adjacent projection transitions. The private revision otherwise uses R3 scoring. No app save or distributed source is changed.'};
  fs.writeFileSync(path.join(destination,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx'});return manifest;
}
if(require.main===module){try{const m=prepare();console.log(JSON.stringify({destination,revision,files:Object.keys(m.forkHashes).length}));}catch(e){console.error(e.stack||e);process.exitCode=1;}}
module.exports={prepare,destination,revision};
