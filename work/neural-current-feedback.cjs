'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),Parent=require('./neural-context-memory-parent.cjs'),I=require('./neural-research-source-identity.cjs'),Motor=require('./neural-command-residual.cjs');
const base=path.resolve(__dirname,'../.impeccable/review/neural-sacl'),directory=path.join(base,'neuronal-memory-archive256-first');
function loadParent(){
 const r=JSON.parse(fs.readFileSync(path.join(directory,'report.json'),'utf8')),v=JSON.parse(fs.readFileSync(path.join(directory,'verification.json'),'utf8')),n=JSON.parse(fs.readFileSync(path.join(directory,'independent-native.json'),'utf8'));
 assert(r.passed&&r.bestClean&&r.eligibleForIndependentNativeProof&&v.passed&&n.passed);assert.equal(v.reportSha256,I.sha(fs.readFileSync(path.join(directory,'report.json'))));assert.equal(n.reportSha256,v.reportSha256);assert.equal(n.actionTraceSha256,r.bestClean.episode.actionTraceSha256);
 for(const [file,digest]of Object.entries({...r.identity.sourceHashes,...r.identity.sourceClosure,...n.sourceHashes}))assert.equal(I.sha(fs.readFileSync(path.resolve(__dirname,'..',file))),digest,file);
 for(const k of ['bestProgress','fitness','laps','reason','totalSimulationSeconds','lapTimes'])assert.deepEqual(n.result[k],r.bestClean.episode.result[k]);
 return {...Parent.load(),frozenMemoryGenes:r.bestClean.genes.slice(),expectedResult:n.result,trace:n.actionTraceSha256,parentReportSha256:v.reportSha256};
}
function fit(rows){
 if(rows.length<32||rows.some(r=>!Array.isArray(r)||r.length!==516||r.some(x=>!Number.isFinite(x)||Math.abs(x)>1)))throw Error('Actual neuronal observations required');
 const mean=Array(128).fill(0),variance=Array(128).fill(0);for(const row of rows)for(let j=0;j<128;j++)mean[j]+=row[384+j]/rows.length;for(const row of rows)for(let j=0;j<128;j++)variance[j]+=(row[384+j]-mean[j])**2/rows.length;
 const ranked=Array.from({length:128},(_,i)=>i).sort((a,b)=>variance[b]-variance[a]||a-b),selected=[];
 for(const limit of [.95,1.000001])for(const j of ranked){if(selected.length===8)break;if(selected.includes(j))continue;const diverse=selected.every(k=>{let covariance=0;for(const row of rows)covariance+=(row[384+j]-mean[j])*(row[384+k]-mean[k])/rows.length;return Math.abs(covariance/Math.max(1e-16,Math.sqrt(variance[j]*variance[k])))<limit;});if(diverse)selected.push(j);}
 return {indices:selected.map(j=>384+j),mean:selected.map(j=>mean[j]),scales:selected.map(j=>Math.max(.02,Math.sqrt(variance[j]))),observationRows:rows.length,selection:'Actual current descending-neuron columns, variance and correlation only; no action labels.'};
}
function validate(genes){if(!Array.isArray(genes)||genes.length!==18||genes.some(x=>!Number.isFinite(x)||Math.abs(x)>8))throw Error('Eighteen bounded feedback coefficients required');}
function features(raw,basis){if(!Array.isArray(raw)||raw.length!==516||raw.some(x=>!Number.isFinite(x)||Math.abs(x)>1)||basis.indices.length!==8||new Set(basis.indices).size!==8||basis.indices.some(i=>!Number.isInteger(i)||i<384||i>=512)||basis.scales.some(s=>!Number.isFinite(s)||s<.02))throw Error('Actual current descending-neuron readout required');return [1,...basis.indices.map((j,i)=>Math.tanh((raw[j]-basis.mean[i])/basis.scales[i]))];}
function compose(prior,raw,basis,genes,gate){validate(genes);if(gate===0||genes.every(v=>v===0))return prior.slice();const f=features(raw,basis),sum=[0,0];for(let k=0;k<9;k++)for(let a=0;a<2;a++)sum[a]+=f[k]*genes[2*k+a]/3;return Motor.compose(prior,gate,sum.map(Math.tanh));}
module.exports={loadParent,fit,features,compose,validate};
