'use strict';
// Fit a neuronal-only late context from an ACTUAL full exploration trajectory.
// Control order chooses training samples, never enters motor inference.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Context=require('./neural-context-readout.cjs'),R=require('./neural-projected-residual.cjs');
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function prepare(reportFile,out){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node24 required');const report=JSON.parse(fs.readFileSync(reportFile,'utf8'));
  if(!report.passed||report.phase!=='finished'||report.full.censored||!report.full.complete||report.full.gasBrakeOverlapSteps||sha(report.full.file)!==report.trajectorySha256)throw Error('Complete actual exploration trace required');
  for(const [file,hash]of Object.entries(report.sourceHashes))if(sha(path.resolve(__dirname,'..',file))!==hash)throw Error('Frozen branch collection source differs');
  const bytes=fs.readFileSync(report.full.file),data=new Float64Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/8),n=report.full.actualActorControls;
  if(n<1000||data.length!==n*530)throw Error('Complete bounded actual rows required');
  const observations=Array.from({length:n},(_,i)=>Array.from(data.subarray(i*530,i*530+516))),mean=Array.from({length:516},(_,j)=>observations.reduce((sum,row)=>sum+row[j],0)/n),scales=mean.map((m,j)=>Math.max(.02,Math.sqrt(observations.reduce((sum,row)=>sum+(row[j]-m)**2,0)/n)));
  const protectedCount=n-96,prefix=observations.slice(0,protectedCount),centreIndices=[n-72,n-48,n-24];
  const centres=centreIndices.map(index=>{const values=observations[index].slice();let nearest=Infinity;for(const row of prefix)nearest=Math.min(nearest,Context.distance(row,values,scales));if(nearest<1e-8)throw Error('No distinct actually observed late neuronal state');return {values,radius:nearest*.75};});
  const basis={scales,centres,protectedCount,sourceObservationCount:n};let gate=R.createGate(basis),firstActivated=-1;const fullTrace=crypto.createHash('sha256'),tailTrace=crypto.createHash('sha256');
  for(let i=0;i<n;i++){
    const g=gate.observe(observations[i]);if(i<protectedCount&&g!==0)throw Error('Every actually observed protected input must have exactly zero support');if(firstActivated<0&&g>0)firstActivated=i;
    const offset=i*530,line=JSON.stringify([data[offset+526],data[offset+527],Array.from(data.subarray(offset+523,offset+526))])+'\n';fullTrace.update(line);if(firstActivated>=0)tailTrace.update(line);
  }
  if(firstActivated<protectedCount||firstActivated>=n-16||fullTrace.digest('hex')!==report.full.actionTraceSha256)throw Error('Real context must activate before the failure, without changing the protected trace');
  const result={format:'male-cns-private-neuronal-branch-context-v1',schema:1,appVersion:'5.6.0',numericRuntime:'24.19.0',branchReportFile:reportFile,branchReportSha256:sha(reportFile),branchActorFile:report.actorFile,branchActorSha256:sha(report.actorFile),parentPreparedFile:path.join(__dirname,'../.impeccable/review/neural-sacl/projected-residual-3803-prepared/prepared.json'),basis,protectedCount,firstActivatedControl:firstActivated,sourceControls:n,sourceFullResult:report.full.result,sourceFullTraceSha256:report.full.actionTraceSha256,sourceCachedPracticeTraceSha256:tailTrace.digest('hex'),centreIndices,
    sourceHashes:Object.fromEntries(['prepare-neural-branch-context.cjs','neural-context-readout.cjs','neural-context-stack.cjs','neural-projected-residual.cjs'].map(f=>[f,sha(path.join(__dirname,f))])),
    boundary:'Only actual raw neuronal inputs define this late context. All protected observations have zero support. Diagnostic progress/time/order never enter inference. The farther crashing branch is exploratory, not a promoted champion or teacher. No full Go-Explore/robustification implementation is claimed.'};
  fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'prepared.json'),JSON.stringify(result));console.log(JSON.stringify({passed:true,file:path.join(out,'prepared.json'),protectedCount,firstActivatedControl:firstActivated,sourceControls:n,sourceFullResult:result.sourceFullResult}));return result;
}
if(require.main===module){if(process.argv.length!==4)throw Error('Actual report and a NEW private output directory required');prepare(path.resolve(process.argv[2]),path.resolve(process.argv[3]));}
module.exports={prepare};
