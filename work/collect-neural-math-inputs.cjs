'use strict';
// Actual initial8physical neuronal states. These are math-test inputs, never
// teacher controls or invented fitness. No claim of a full completed episode.
const fs=require('node:fs'),path=require('node:path'),Model=require('./neural-statehead-model.cjs'),I=require('./neural-research-source-identity.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.impeccable/review/neural-sacl/neuronal-v8-math-inputs');
if(process.versions.node!=='24.19.0'||fs.existsSync(out))throw Error('Pinned runtime and NEW output directory required');fs.mkdirSync(out,{recursive:false});
const file=path.join(root,'.impeccable/review/neural-sacl/neuronal-statehead-6584-cma-search/clean.malecns-statehead.json'),loaded=Model.load(file),env=Model.createFromLoaded(loaded),values=[],states=[];
for(let control=0;control<8;control++){const c=env.currentCar(),start=values.length;for(const x of c.brain.sum)values.push(x);for(const x of c.brain.activity)values.push(8*x);states.push({control,offset:start,count:values.length-start,simulationSeconds:env.state().totalSimulationSeconds,progress:c.bestProgress});if(control<7)env.step();}
const array=Float64Array.from(values),bytes=Buffer.from(array.buffer);fs.writeFileSync(path.join(out,'inputs.f64'),bytes);
fs.writeFileSync(path.join(out,'metadata.json'),JSON.stringify({format:'male-cns-actual-neuronal-math-inputs-v1',nodeVersion:process.versions.node,v8Version:process.versions.v8,modelSha256:loaded.sha256,inputSha256:I.sha(bytes),values:values.length,states,sourceHashes:I.collect(['work/collect-neural-math-inputs.cjs','.impeccable/runtime-node24/node.exe','outputs/data/connectome.json','outputs/data/circuits.json']),boundary:'Actual sums and8xactivity from8initial reached neural states over7physicalcontrols only. Not a completed lap, driving proof, optimizer examples or target actions.'},null,2));
console.log(JSON.stringify({values:values.length,states:states.length,inputSha256:I.sha(bytes)}));
