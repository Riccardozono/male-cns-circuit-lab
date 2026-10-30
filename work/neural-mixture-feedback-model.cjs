'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),Core=require('./neural-current-feedback.cjs'),I=require('./neural-research-source-identity.cjs');
function load(){const dir=path.resolve('.impeccable/review/neural-sacl/neuronal-coordinate-feedback8-first'),r=JSON.parse(fs.readFileSync(path.join(dir,'report.json'),'utf8')),v=JSON.parse(fs.readFileSync(path.join(dir,'verification.json'),'utf8')),n=JSON.parse(fs.readFileSync(path.join(dir,'independent-native.json'),'utf8'));
 assert(r.passed&&r.bestClean&&r.eligibleForIndependentNativeProof&&v.passed&&n.passed);assert.equal(v.reportSha256,I.sha(fs.readFileSync(path.join(dir,'report.json'))));assert.equal(n.reportSha256,v.reportSha256);assert.equal(n.actionTraceSha256,r.bestClean.episode.actionTraceSha256);
 for(const [file,digest]of Object.entries({...r.identity.sourceHashes,...r.identity.sourceClosure,...n.sourceHashes}))assert.equal(I.sha(fs.readFileSync(path.resolve(file))),digest,file);
 for(const k of ['bestProgress','fitness','laps','reason','totalSimulationSeconds','lapTimes'])assert.deepEqual(n.result[k],r.bestClean.episode.result[k]);
 return {base:Core.loadParent(),initialGenes:[...r.bestClean.genes,0],expectedResult:n.result,trace:n.actionTraceSha256,reportSha256:v.reportSha256};}
function validate(genes){if(!Array.isArray(genes)||genes.length!==19||genes.some(x=>!Number.isFinite(x)||Math.abs(x)>8))throw Error('Eighteen readout and one bounded learned mixture coefficient required');}
module.exports={load,validate};
