'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),I=require('./neural-research-source-identity.cjs'),Model=require('./neural-instant-context-model.cjs'),Origin=require('./neural-statehead-model.cjs');
const base=path.resolve(__dirname,'../.impeccable/review/neural-sacl'),directory=path.join(base,'neuronal-next-instant256-first');
function load(){
 const reportFile=path.join(directory,'report.json'),r=JSON.parse(fs.readFileSync(reportFile,'utf8')),v=JSON.parse(fs.readFileSync(path.join(directory,'verification.json'),'utf8')),n=JSON.parse(fs.readFileSync(path.join(directory,'independent-native.json'),'utf8'));
 assert(r.passed&&r.eligibleForIndependentNativeProof&&r.bestClean&&v.passed&&n.passed);assert.equal(v.reportSha256,I.sha(fs.readFileSync(reportFile)));assert.equal(n.reportSha256,v.reportSha256);
 for(const [file,digest]of Object.entries({...r.identity.sourceHashes,...r.identity.sourceClosure,...n.sourceHashes}))assert.equal(I.sha(fs.readFileSync(path.resolve(__dirname,'..',file))),digest,file);
 assert.equal(I.sha(fs.readFileSync(r.identity.originFile)),r.identity.originSha256);assert.equal(I.sha(fs.readFileSync(r.identity.preparedFile)),r.identity.preparedSha256);assert.equal(n.actionTraceSha256,r.bestClean.episode.actionTraceSha256);
 for(const key of ['bestProgress','fitness','laps','reason','totalSimulationSeconds','lapTimes'])assert.deepEqual(n.result[key],r.bestClean.episode.result[key]);
 const winner=Model.load(r.identity.originFile),loaded=Origin.load(winner.parentFile),old=JSON.parse(winner.data.preparedText),prepared=JSON.parse(fs.readFileSync(r.identity.preparedFile,'utf8'));
 return {winner,loaded,old,prepared,initialGenes:[...r.bestClean.genes,0,0,0],expectedResult:n.result,trace:n.actionTraceSha256,reportSha256:v.reportSha256};
}
module.exports={load};
