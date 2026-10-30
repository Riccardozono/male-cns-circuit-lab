'use strict';
// Standalone input-drive derivatives only. Synthetic sensor probes do not
// control any vehicle and are never added to observations/replay/training.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),F=require('../outputs/simulation.js'),Legacy=require('../outputs/legacy-models.js'),Profiles=require('../outputs/model-profiles.js');
const root=path.resolve(__dirname,'..'),directory=path.join(root,'.impeccable/review/neural-sacl/policy-sensor-routing'),hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
if(fs.existsSync(path.join(directory,'report.json')))throw Error('Preserve existing input audit');fs.mkdirSync(directory,{recursive:true});
const source=require('../outputs/data/connectome.json'),metadata=require('../outputs/data/connectome-full.json'),bytes=fs.readFileSync(path.join(root,'outputs/data',metadata.binary));
if(bytes.length!==metadata.binaryBytes||hash(bytes)!==metadata.binarySha256)throw Error('Verified complete anatomical bundle required');
const constructors={float64:Float64Array,float32:Float32Array,int32:Int32Array,uint32:Uint32Array,uint8:Uint8Array,int8:Int8Array},buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),full={...metadata,compact:true};
for(const [name,d]of Object.entries(metadata.arrays)){const Type=constructors[d.dtype];if(!Type)throw Error('Unknown typed anatomical array');full[name]=new Type(buffer,d.offset,d.length);}
const definitions=[['v2',Legacy.buildV2(source)],['v3',Legacy.tagV3(source)],['v4',full],['v5',Profiles.buildV5(full)]],models=[];
for(const [id,data]of definitions){
  const graph=F.compileGraph(data);F.ensureLearning(graph);const genome=F.makeLearningGenome?F.makeLearningGenome(graph,F.rng(1519)):{adapterVersion:graph.learning.version,policyWeights:require('../outputs/neural-learning.js').initial(graph,F.rng(1519))};
  const sensors=Array(F.SENSOR_COUNT).fill(0),channels=[];
  for(let c=0;c<F.SENSOR_COUNT;c++){
    const k=c;if(k>=graph.inputs.length)throw Error('Insufficient actual neural inputs');const base=F.sensorDrive(graph,genome,sensors,k,F.PHYSICS_ADAPTER_GAIN),probe=sensors.slice();probe[c]=.1;
    const delta=F.sensorDrive(graph,genome,probe,k,F.PHYSICS_ADAPTER_GAIN)-base,expected=.7*.1*(c<F.VISUAL_SENSOR_COUNT?2:1)*genome.policyWeights[c];
    if(Math.abs(delta-expected)>1e-12||delta===0)throw Error('Policy sensor drive not receiving channel '+c);
    let count=0;for(let j=0;j<graph.inputs.length;j++)count+=Number(j%F.SENSOR_COUNT===c);
    channels.push({channel:c,relays:count,inputDriveDelta:delta});
  }
  models.push({id,neurons:graph.n,edges:graph.edgeCount,policyVersion:graph.learning.version,inputs:graph.inputs.length,visualChannels:F.VISUAL_SENSOR_COUNT,totalChannels:F.SENSOR_COUNT,allPolicyChannelsReachInputDrive:true,channels,
    legacyVisualChannels:[...new Set(graph.inputChannels)].sort((a,b)=>a-b)});
}
const report={passed:true,models,sourceHashes:Object.fromEntries(['outputs/simulation.js','outputs/neural-learning.js','outputs/legacy-models.js','outputs/model-profiles.js','work/audit-policy-sensor-routing.cjs'].map(file=>[file,hash(fs.readFileSync(path.join(root,file)))])),binarySha256:hash(bytes),
  correction:'The legacy graph.inputChannels table does not describe the learned-policy route. With policyWeights, sensorDrive delegates to Learning.drive(k % 28). No sensor-routing fix was applied based on the legacy-only counts.',
  boundary:'Verified sensor injection path for current V2-V5 initial policies. This is not a complete synaptic/descending-readout sensitivity test, physical driving test, learned-save verification, convergence result or evidence of completed laps. No vehicle controls, anatomy, source files or rewards changed.'};
fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2));console.log('POLICY_SENSOR_AUDIT '+JSON.stringify({passed:true,models:models.map(({channels,...m})=>m)}));
