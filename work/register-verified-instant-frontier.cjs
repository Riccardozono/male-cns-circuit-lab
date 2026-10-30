'use strict';
// A NEW research registry; the older catalog and Windows defaults stay intact.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),Model=require('./neural-instant-context-model.cjs'),I=require('./neural-research-source-identity.cjs');
const base=path.resolve('.impeccable/review/neural-sacl'),study=path.join(base,'neuronal-instant-context256-first'),file=path.join(study,'clean.malecns-instant-context.json'),read=name=>JSON.parse(fs.readFileSync(path.join(study,name),'utf8'));
const loaded=Model.load(file),qualification=read('native-qualification.json'),cleanProof=read('clean-file-native-proof/verification.json'),numeric=read('verification.json'),report=read('report.json');
assert.equal(loaded.data.status,'clean-native-verified');assert(qualification.passed&&cleanProof.passed&&numeric.passed&&report.passed&&report.eligibleForIndependentNativeProof);assert.equal(qualification.cleanModelSha256,loaded.sha256);assert.equal(cleanProof.modelSha256,loaded.sha256);assert.equal(cleanProof.actionTraceSha256,loaded.data.fullTraceSha256);assert.equal(cleanProof.cuda.cpuFallbacks,0);assert.equal(numeric.reportSha256,I.sha(fs.readFileSync(path.join(study,'report.json'))));assert.deepEqual(cleanProof.sourceCompatibility,Model.compatibility());
const keys=['bestProgress','fitness','laps','reason','totalSimulationSeconds','lapTimes'];for(const k of keys)assert.deepEqual(cleanProof.result[k],loaded.data.expectedResult[k]);
const registry={format:'male-cns-private-verified-research-frontier-v2',schema:1,appVersion:'5.6.0',numericRuntime:'24.19.0',modelId:'v3',circuitId:'monza',
 selected:{family:'instant-neural-context-v1',modelFile:file,modelSha256:loaded.sha256,parentModelSha256:loaded.data.parentSha256,result:loaded.data.expectedResult,fullTraceSha256:loaded.data.fullTraceSha256,
 evidence:Object.fromEntries(['report.json','verification.json','native-qualification.json','clean-file-native-proof/verification.json'].map(name=>[name,I.sha(fs.readFileSync(path.join(study,name)))]))},
 activeWindowsDefault:require('./neural-chain-desktop-model.cjs').defaultChoice(),
 automaticallyActivated:false,boundary:'Research frontier only, not the Windows active default. A future candidate must beat this globally verified clean reference, not merely its own older parent. One lap, not two; no deployment, old-file conversion or release.',
 registrarSha256:I.sha(fs.readFileSync(__filename))};
const out=path.join(base,'verified-research-frontier-v2.json');fs.writeFileSync(out,JSON.stringify(registry,null,2),{flag:'wx'});console.log(JSON.stringify({registered:true,file:out,researchProgress:registry.selected.result.bestProgress,activeWindowsProgress:registry.activeWindowsDefault.result.bestProgress,automaticallyActivated:false}));
