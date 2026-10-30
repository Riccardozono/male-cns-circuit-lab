'use strict';
// Check actual first Gaussian actions against the authoritative Node RNG;
// distinct metadata labels alone are not evidence of distinct exploration.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{rng}=require('../outputs/simulation.js');
const out=path.resolve('.impeccable/review/neural-sacl',process.argv[2]),identity=JSON.parse(fs.readFileSync(path.join(out,'identity.json'),'utf8')),batch=JSON.parse(fs.readFileSync(path.join(out,'rollout-001.json'),'utf8')),records=[];
assert.equal(batch.environments.length,4);
for(let k=0;k<4;k++){
 // The actual trainer exponentiates Float64 log_std. Those representable
 // scales are not exactly the source decimal literals .12 and .08.
 const segment=batch.environments[k],seed=161026+104729*k,r=rng(seed),normal=()=>Math.sqrt(-2*Math.log(Math.max(1e-12,r())))*Math.cos(2*Math.PI*r()),first=segment.rows[0],expected=identity.initialStd.map(s=>s*normal());
 assert.equal(segment.seed,seed);assert.deepEqual(first.mean,[0,0]);assert.deepEqual(first.action,expected);records.push({index:k,seed,actualAction:first.action});
}
assert.equal(new Set(records.map(r=>JSON.stringify(r.actualAction))).size,4);
const proof={passed:true,actualDistinctStreams:4,records,firstBatchSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(out,'rollout-001.json'))).digest('hex'),sourceSha256:crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),boundary:'Actual first-action RNG stream audit; not a claim of learning improvement.'};
fs.writeFileSync(path.join(out,'seed-verification.json'),JSON.stringify(proof,null,2),{flag:'wx'});console.log(JSON.stringify(proof));
