'use strict';
const fs=require('node:fs'),path=require('node:path'),Frontier=require('./neural-frontier-model.cjs'),Head=require('./neural-json-head.cjs');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'.impeccable/review/neural-sacl/frontier-native-model'),base=path.join(root,'.impeccable/review/neural-sacl/context-stack-3/model.malecns-neural-context.json'),reportFile=path.join(root,'.impeccable/review/neural-sacl/frontier-retained-cma-first/report.json'),basisFile=path.join(root,'.impeccable/review/neural-sacl/context-frontier-basis/prepared.json');
const report=JSON.parse(fs.readFileSync(reportFile,'utf8')),prepared=JSON.parse(fs.readFileSync(basisFile,'utf8'));
if(!report.passed||prepared.sourceModelSha256!==Head.sha(fs.readFileSync(base,'utf8'))||report.environment.gateBasisSha256!==Head.sha(fs.readFileSync(basisFile,'utf8'))||JSON.stringify(report.fullChampion.result)!==JSON.stringify(report.independentChampionRepeat.result))throw Error('Verified actual matching own sources required');
if(fs.existsSync(path.join(dir,'model.malecns-neural-frontier.json')))throw Error('Preserve existing private export');fs.mkdirSync(dir,{recursive:true});
const data={format:'male-cns-private-frontier-model',schema:1,appVersion:'5.6.0',decoderRevision:'learned-retained-frontier-v1',numericRuntime:'24.19.0',
  baseModelEnvelope:JSON.parse(fs.readFileSync(base,'utf8')),basis:prepared.basis,weights:report.champion.weights,verifiedFullResult:report.fullChampion.result,
  provenance:{reportSha256:Head.sha(fs.readFileSync(reportFile,'utf8')),basisSha256:Head.sha(fs.readFileSync(basisFile,'utf8'))},
  boundary:'Private incompatible data-only experiment, not a normal malecns-save, new version or release. Actually evolved neuronal coefficients, no route/teacher action tape. Zero laps so far; not a cold start or complete neuroscience simulation.'};
const text=Frontier.encode(data);Frontier.parse(text);fs.writeFileSync(path.join(dir,'model.malecns-neural-frontier.json'),text);
console.log('FRONTIER_EXPORTED '+JSON.stringify({sha256:Head.sha(text),verified:data.verifiedFullResult}));
