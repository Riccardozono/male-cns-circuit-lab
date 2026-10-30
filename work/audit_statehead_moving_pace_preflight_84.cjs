'use strict';
// Read-only audit of the full paired replay report; no new GPU replay.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.impeccable/review/learning-ml');
const dir=path.join(base,'statehead-moving-pace-preflight-20261026-84'),reportPath=path.join(dir,'report.json');
const save='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const check=(x,msg)=>{if(!x)throw Error(msg);},r=read(reportPath);
check(r.passed&&r.originalSaveSha256===sha(save),'Preflight or save identity failed');
for(const [name,digest] of Object.entries(r.sourceHashes))check(sha(path.join(root,name))===digest,'Source changed: '+name);
const a=r.results.previous,b=r.results.movingPace;
for(const name of ['protected','trainingFrontier']){
  check(JSON.stringify(a[name])===JSON.stringify(b[name]),'Paired trace or result mismatch: '+name);
  check(a[name].controls>0&&/^[0-9a-f]{64}$/.test(a[name].traceSha256),'Missing complete trace');
}
check(a.protected.result.laps===1&&a.trainingFrontier.result.laps===0,'Unexpected reference policies');
for(const stats of [a.cuda,b.cuda])check(stats.gpuCalls===stats.calls&&stats.gpuCalls>0&&stats.cpuFallbacks===0&&stats.device.name==='NVIDIA GeForce RTX 4060','GPU accounting mismatch');
const out={passed:true,reportSha256:sha(reportPath),originalSaveSha256:sha(save),verifiedSourceCount:Object.keys(r.sourceHashes).length,
  matchedPolicies:['protected','trainingFrontier'],gpuCallsPerArm:a.cuda.gpuCalls,movingDeferrals:b.cuda.slowPaceDeferrals,
  boundary:'Independent report and source readback; no additional replay or learning result.'};
const target=path.join(dir,'verification.json');fs.writeFileSync(target,JSON.stringify(out,null,2)+'\n',{encoding:'utf8',flag:'wx'});
console.log(JSON.stringify({verification:target,sha256:sha(target),...out}));
