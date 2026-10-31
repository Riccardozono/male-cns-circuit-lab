/* Reward-trained policy over the recurrent MaleCNS graph.
 * No wall-following rule, target-speed formula, sensor reconstruction or driving
 * calibration. The action decoder receives REAL recurrent neuron activity only.
 * Topology is fixed; a diagonal evolution strategy learns sensor injection,
 * shared synaptic log-gains, descending-neuron readout and two action biases.
 * Artificial rate dynamics and learned weights are not validated fly biology.
 */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.MaleCNSLearning=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const VERSION=3,CHANNELS=28,GAIN_GROUPS=16,READOUT_LIMIT=64,CONTROL_INTERVAL=6,MIN_POLICY_CONTEXT_SPEED_MPS=2;
  const LEGACY_SENSOR_MAPPING_VERSION=1,SENSOR_MAPPING_VERSION=2;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const normal=r=>Math.sqrt(-2*Math.log(Math.max(1e-9,r())))*Math.cos(2*Math.PI*r());
  function build(graph){
    const config=graph.policyConfig,version=config?.version??VERSION,gainGroups=config?.gainGroups??GAIN_GROUPS,readoutLimit=config?.readoutLimit??READOUT_LIMIT;
    if(!supportedVersion(version)||!Number.isInteger(gainGroups)||gainGroups<1||gainGroups>256||!Number.isInteger(readoutLimit)||readoutLimit<graph.outputs.length||readoutLimit>256)throw Error('Configurazione della policy neurale non valida.');
    const inputSet=new Set(graph.inputs),distance=new Int32Array(graph.n);distance.fill(-1);
    const queue=new Uint32Array(graph.n);let head=0,tail=0;
    for(const input of graph.inputs){distance[input]=0;queue[tail++]=input;}
    while(head<tail){const source=queue[head++];for(let e=graph.rowOffsets[source];e<graph.rowOffsets[source+1];e++){const target=graph.targets[e];if(distance[target]<0){distance[target]=distance[source]+1;queue[tail++]=target;}}}
    const inputStrength=new Float64Array(graph.n);
    for(const source of graph.inputs)for(let e=graph.rowOffsets[source];e<graph.rowOffsets[source+1];e++)inputStrength[graph.targets[e]]+=graph.csrWeights[e];
    const candidates=[];
    for(let node=0;node<graph.n;node++)if(!inputSet.has(node)&&distance[node]>0&&graph.classNames[graph.classCodes[node]]==='descending_neuron'&&(!graph.full||graph.coreMask[node]||config)){
      candidates.push(node);
    }
    candidates.sort((a,b)=>inputStrength[b]-inputStrength[a]||distance[a]-distance[b]||graph.bodyIds[a]-graph.bodyIds[b]);
    const selected=new Set(graph.outputs);
    if(config){
      // Keep the original core decoder identities; extend it with reachable
      // descending neurons outside that core, not raw sensors or route cues.
      for(const node of candidates){if(selected.size>=config.coreReadoutLimit)break;if(graph.coreMask[node])selected.add(node);}
      for(const node of candidates){if(selected.size>=readoutLimit)break;if(!graph.coreMask[node])selected.add(node);}
      if(selected.size!==readoutLimit)throw Error('Neuroni discendenti reali insufficienti per V5.');
    }else for(const node of candidates){if(selected.size>=readoutLimit)break;selected.add(node);}
    if(selected.size<graph.outputs.length)throw Error('Readout neurale discendente mancante.');
    const nodes=Uint32Array.from(selected),groups=new Uint8Array(graph.n);
    for(let n=0;n<graph.n;n++)groups[n]=Math.abs(Math.imul(Number(graph.bodyIds[n])|0,0x45d9f3b))%gainGroups;
    const length=CHANNELS*2+gainGroups+nodes.length*2+2,mean=Array(length).fill(0),scales=Array(length).fill(.1);
    for(let c=0;c<CHANNELS;c++){mean[c]=1;scales[c]=.15;scales[CHANNELS+c]=.08;}
    for(let g=0;g<gainGroups;g++)scales[CHANNELS*2+g]=.08;
    const readoutOffset=CHANNELS*2+gainGroups;
    for(let j=0;j<nodes.length;j++){scales[readoutOffset+j*2]=.08;scales[readoutOffset+j*2+1]=.2;}
    scales[length-2]=.035;scales[length-1]=.12;
    const policy={version,nodes,groups,gainGroups,length,readoutOffset,mean,scales,trainingSamples:0,controlRateHz:60/CONTROL_INTERVAL,anatomicalEdges:graph.edgeCount};
    if(config)for(const node of nodes)graph.outputMask[node]=1;
    graph.learning=policy;return policy;
  }
  function valid(graph,values){const p=graph.learning;return !!p&&Array.isArray(values)&&values.length===p.length&&values.every(v=>Number.isFinite(v)&&Math.abs(v)<=8);}
  function supportedVersion(version){return version===VERSION||version===5;}
  function initial(graph,r){
    const p=graph.learning;
    return p.mean.map((v,i)=>clamp(v+normal(r)*p.scales[i],-8,8));
  }
  function supportedSensorMappingVersion(version){return version===LEGACY_SENSOR_MAPPING_VERSION||version===SENSOR_MAPPING_VERSION;}
  function drive(graph,genome,sensors,k,physicsGain=.35){
    const values=genome.policyWeights,mappingVersion=genome.sensorMappingVersion??LEGACY_SENSOR_MAPPING_VERSION;
    if(mappingVersion===LEGACY_SENSOR_MAPPING_VERSION){
      const channel=k%CHANNELS,raw=Number.isFinite(sensors?.[channel])?sensors[channel]:0;
      // Preserve the original modulo interpretation for existing checkpoints.
      const input=channel<11?raw*2-1:raw;
      return .7*(input*values[channel]+values[CHANNELS+channel]);
    }
    if(mappingVersion!==SENSOR_MAPPING_VERSION)throw Error('Versione di mappatura dei sensori non supportata.');
    const term=channel=>{const raw=Number.isFinite(sensors?.[channel])?sensors[channel]:0,input=channel<11?raw*2-1:raw;return input*values[channel]+values[CHANNELS+channel];};
    const visualChannel=Number.isInteger(graph.inputChannels?.[k])?graph.inputChannels[k]:k%11;
    let contribution=term(visualChannel);
    const physicsChannel=graph.physicsChannels?.[k]??-1,roadChannel=graph.roadChannels?.[k]??-1;
    if(physicsChannel>=11)contribution+=physicsGain*term(physicsChannel);
    if(roadChannel>=18)contribution+=physicsGain*term(roadChannel);
    return .7*contribution;
  }
  function synapticGains(graph,genome){
    const p=graph.learning,values=genome?.adapterVersion===(p?.version??VERSION)&&genome.policyWeights;
    return Float32Array.from({length:p?.gainGroups??GAIN_GROUPS},(_,g)=>values?Math.exp(clamp(values[CHANNELS*2+g],-.8,.8)):1);
  }
  function commands(graph,brain,genome,enabled=true,edgesEnabled=true,launchBias=0){
    if(!enabled||!edgesEnabled)return [0,0,0];
    const p=graph.learning,values=genome.policyWeights;
    if(genome.adapterVersion!==p.version||!valid(graph,values))throw Error('Policy MaleCNS incompatibile: usare Reset, non il vecchio controller assistito.');
    const features=brain.policyFeatures?.length===p.nodes.length?brain.policyFeatures:(brain.policyFeatures=new Float64Array(p.nodes.length));
    let signal=0,steering=0,longitudinal=0;
    const norm=1/Math.sqrt(features.length);
    for(let j=0;j<features.length;j++){
      const activity=Number(brain.activity[p.nodes[j]])||0;
      signal=Math.max(signal,Math.abs(activity));
      const feature=features[j]=Math.tanh(8*activity);
      steering+=feature*values[p.readoutOffset+j*2]*norm;
      longitudinal+=feature*values[p.readoutOffset+j*2+1]*norm;
    }
    // A readout bias cannot drive a car when synaptic propagation is absent.
    if(signal<1e-7)return [0,0,0];
    steering=Math.tanh(steering+values[values.length-2]);
    longitudinal=Math.tanh(longitudinal+values[values.length-1]);
    longitudinal=clamp(longitudinal+(Number.isFinite(launchBias)?launchBias:0),-1,1);
    return [steering,Math.max(0,longitudinal),Math.max(0,-longitudinal)];
  }
  function mutate(graph,values,r,amount){
    const p=graph.learning,scale=Math.max(0,amount)/.16;
    if(!scale)return values.slice();
    return values.map((v,i)=>clamp(v+normal(r)*p.scales[i]*scale,-8,8));
  }
  function localMutation(graph,values,r,amount){
    // Change one functional block at a time. Good motor behaviour need not be
    // destroyed by perturbing the whole sensory/recurrent adapter every child.
    const p=graph.learning,block=Math.floor(r()*4),scale=Math.max(0,amount)/.16;
    return values.map((v,i)=>{
      const motor=i>=p.readoutOffset,steering=motor&&((i-p.readoutOffset)%2===0);
      const chosen=block===0?steering:block===1?motor&&!steering:block===2?i<CHANNELS*2:i>=CHANNELS*2&&i<p.readoutOffset;
      return chosen&&scale?clamp(v+normal(r)*p.scales[i]*scale,-8,8):v;
    });
  }
  function rememberActivity(brain,speedMps=null){
    // Training-only observations while the vehicle is moving. Stationary
    // brake-hold frames must not become the most frequent context that the
    // motor mutation preserves. This metadata never enters neural inference.
    // No sensors, coordinates, track progress, target actions or reward labels
    // enter the cache; calls without speed retain the helper's test API.
    if(speedMps!==null&&(!Number.isFinite(speedMps)||Math.abs(speedMps)<MIN_POLICY_CONTEXT_SPEED_MPS))return false;
    const features=brain.policyFeatures;if(!features?.length)return false;
    const experience=brain.policyExperience||(brain.policyExperience={centres:[],samples:0});
    experience.samples++;const centres=experience.centres;
    let nearest=null,distance=Infinity;
    for(const centre of centres){let d=0;for(let j=0;j<features.length;j++)d+=(features[j]-centre.values[j])**2;d/=features.length;if(d<distance){distance=d;nearest=centre;}}
    if(!nearest||distance>.0225&&centres.length<12){centres.push({values:Array.from(features),count:1});return true;}
    // Replace a rarely observed pattern when a new neural context arrives;
    // keep the frequently visited contexts needed to preserve useful behaviour.
    if(distance>.0225&&centres.length===12){const rare=centres.reduce((a,b)=>a.count<b.count?a:b);if(rare.count<=2){rare.values=Array.from(features);rare.count=1;return true;}}
    nearest.count++;const rate=1/nearest.count;
    for(let j=0;j<features.length;j++)nearest.values[j]+=(features[j]-nearest.values[j])*rate;
    return true;
  }
  function motorVector(features){const norm=1/Math.sqrt(features.length);return [...features.map(v=>v*norm),1];}
  const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
  function orthogonal(vector,basis){
    const result=vector.slice();
    // Two passes avoid cancelling the small useful contrast through numerical
    // error when recurrent descending neurons are strongly correlated.
    for(let pass=0;pass<2;pass++)for(const b of basis){const projection=dot(result,b);for(let j=0;j<result.length;j++)result[j]-=projection*b[j];}
    return result;
  }
  function safeMotorMutation(graph,values,r,amount,experience,focus=null){
    const p=graph.learning,scale=Math.max(0,amount)/.16;if(!scale)return values.slice();
    const focusedActions=focus==='longitudinal'?[1]:focus==='steering'?[0]:focus==='combined'?[0,1]:null;
    const centres=experience?.centres?.filter(c=>c.values?.length===p.nodes.length&&c.values.every(Number.isFinite)&&c.count>0);
    if(!centres?.length&&!focusedActions)return localMutation(graph,values,r,amount*.35);
    const sorted=(centres||[]).slice().sort((a,b)=>b.count-a.count),basis=[];
    // Preserve the incumbent's own outputs in its most visited neural context.
    // This is a null-space mutation of the motor readout, not a driving rule.
    // Protecting several correlated contexts also froze the failing corner
    // response. One anchor keeps the dominant behaviour without that lock.
    for(const centre of sorted.slice(0,1)){
      const v=orthogonal(motorVector(centre.values),basis),length=Math.sqrt(dot(v,v));
      if(length>1e-7)basis.push(v.map(x=>x/length));
    }
    const contrasts=(centres||[]).map(c=>{const v=orthogonal(motorVector(c.values),basis);return {v,norm2:dot(v,v)};}).filter(c=>c.norm2>1e-5);
    let direction,target;
    if(contrasts.length){
      // Sample genuinely different neural contexts preferentially. Tiny
      // contrasts mostly cause coefficient noise, not useful action changes.
      let draw=r()*contrasts.reduce((sum,c)=>sum+c.norm2,0),c=contrasts.at(-1);
      for(const candidate of contrasts){draw-=candidate.norm2;if(draw<=0){c=candidate;break;}}
      direction=c.v;target=c.norm2;
      if(r()<.5){
        const randomDirection=orthogonal(Array.from({length:p.nodes.length+1},()=>normal(r)),basis),response=Math.abs(dot(randomDirection,c.v));
        if(response>1e-5){direction=randomDirection;target=response;}
      }
    }
    else {direction=orthogonal(Array.from({length:p.nodes.length+1},()=>normal(r)),basis);target=Math.sqrt(dot(direction,direction));}
    if(!(target>1e-7))return values.slice();
    const roll=r(),actions=focusedActions||(roll<.35?[0]:roll<.7?[1]:[0,1]),child=values.slice();
    // A bend may require a coordinated brake/steering change, while neither
    // isolated change is better under the real rollout reward.
    for(const action of actions){
      const magnitude=normal(r)*.24*scale,delta=direction.map(v=>v*magnitude/target);
      const size=Math.sqrt(dot(delta,delta));let shrink=size>6?6/size:1;
      const indices=Array.from({length:p.nodes.length},(_,j)=>p.readoutOffset+j*2+action);indices.push(values.length-2+action);
      for(let j=0;j<indices.length;j++)if(delta[j])shrink=Math.min(shrink,(8-Math.abs(values[indices[j]]))/Math.abs(delta[j]));
      for(let j=0;j<indices.length;j++)child[indices[j]]+=delta[j]*shrink*(1-1e-12);
    }
    return child;
  }
  function scaleMutation(values,child,factor){
    const delta=values.map((v,i)=>(child[i]-v)*factor);let shrink=1;
    for(let i=0;i<values.length;i++)if(delta[i])shrink=Math.min(shrink,(8-Math.abs(values[i]))/Math.abs(delta[i]));
    return values.map((v,i)=>v+delta[i]*shrink*(1-1e-12));
  }
  function mirroredMutation(values,child){return values.map((v,i)=>clamp(2*v-child[i],-8,8));}
  class EvolutionStrategy{
    constructor(graph){this.graph=graph;const p=graph.learning;this.mean=p.mean.slice();this.sigma=p.scales.slice();this.updates=0;this.episodes=0;}
    update(ranked,compare=(a,b)=>b.fitness-a.fitness){
      if(typeof compare!=='function')throw Error('Criterio di selezione neurale non valido.');
      const eligible=ranked.filter(agent=>valid(this.graph,agent.genome?.policyWeights)).sort(compare);
      if(eligible.length<2)return;
      this.updates++;this.episodes+=eligible.length;
      // An identical return supplies no preference signal. Never learn a
      // direction just because an agent happened to be first in the array.
      if(eligible.every(agent=>compare(agent,eligible[0])===0))return;
      const count=Math.min(eligible.length,Math.max(1,Math.min(Math.floor(eligible.length/2),Math.max(2,Math.ceil(eligible.length/4)))));
      const eliteWeights=Array.from({length:count},(_,i)=>Math.log(count+.5)-Math.log(i+1)),total=eliteWeights.reduce((a,b)=>a+b,0);
      eliteWeights.forEach((_,i)=>eliteWeights[i]/=total);
      const weights=Array(eligible.length).fill(0),scaleWeights=Array(eligible.length).fill(0);
      for(let i=0;i<count;i++){
        weights[i]=eliteWeights[i];scaleWeights[i]=eliteWeights[i];
        weights[eligible.length-1-i]=-eliteWeights[i];
      }
      // Use the bottom ranked trials as a negative direction signal without
      // allowing them into the safe-only parent/champion path. Spread adaptation
      // still uses elites only; rank ties remain order-invariant across cutoffs.
      for(let start=0;start<eligible.length;){
        let end=start+1;while(end<eligible.length&&compare(eligible[end],eligible[start])===0)end++;
        const tied=weights.slice(start,end).reduce((a,b)=>a+b,0)/(end-start),tiedScale=scaleWeights.slice(start,end).reduce((a,b)=>a+b,0)/(end-start);
        for(let i=start;i<end;i++){weights[i]=tied;scaleWeights[i]=tiedScale;}
        start=end;
      }
      const p=this.graph.learning;
      for(let j=0;j<this.mean.length;j++){
        let direction=0,variance=0,scaleTotal=0;
        for(let i=0;i<eligible.length;i++){
          direction+=weights[i]*(eligible[i].genome.policyWeights[j]-this.mean[j]);
          variance+=scaleWeights[i]*(eligible[i].genome.policyWeights[j]-this.mean[j])**2;scaleTotal+=scaleWeights[i];
        }
        this.mean[j]=clamp(this.mean[j]+.325*direction,-8,8);
        this.sigma[j]=clamp(Math.sqrt(.85*this.sigma[j]**2+.15*variance/Math.max(1e-12,scaleTotal)),p.scales[j]*.5,p.scales[j]*3);
      }
    }
    sample(r,amount=.16,stagnation=0,mirror=null){
      const p=this.graph.learning,scale=Math.max(0,amount)/.16*Math.min(2.2,1+stagnation*.055);
      if(mirror)return this.mean.map((v,j)=>clamp(2*v-mirror[j],-8,8));
      // Cap the perturbation rather than clipping each child independently:
      // mirrored trials stay opposite even at the parameter bounds.
      return this.mean.map((v,j)=>{const radius=Math.max(0,8-Math.abs(v));return v+clamp(normal(r)*this.sigma[j]*scale,-radius,radius);});
    }
    adopt(values){if(!valid(this.graph,values))throw Error('Checkpoint RL incompatibile.');this.mean=values.slice();this.sigma=this.graph.learning.scales.slice();}
    explore(stagnation){
      // A population of nearly identical local improvements must not collapse
      // the search radius while the car is stuck at the same corner.
      if(stagnation<3)return;
      const p=this.graph.learning;
      this.sigma=this.sigma.map((s,j)=>Math.min(p.scales[j]*3,Math.max(s*1.2,p.scales[j]*.8)));
    }
    metrics(){return {algorithm:'diagonal evolution strategy',version:this.graph.learning.version,updates:this.updates,episodes:this.episodes,parameters:this.mean.length,meanExploration:this.sigma.reduce((a,b)=>a+b,0)/this.sigma.length,warmStart:false};}
  }
  return {VERSION,CHANNELS,GAIN_GROUPS,CONTROL_INTERVAL,MIN_POLICY_CONTEXT_SPEED_MPS,LEGACY_SENSOR_MAPPING_VERSION,SENSOR_MAPPING_VERSION,build,valid,supportedVersion,supportedSensorMappingVersion,initial,drive,synapticGains,commands,mutate,localMutation,rememberActivity,safeMotorMutation,scaleMutation,mirroredMutation,EvolutionStrategy};
});
