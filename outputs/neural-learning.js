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
  const VERSION=3,CHANNELS=28,GAIN_GROUPS=16,READOUT_LIMIT=64,CONTROL_INTERVAL=6;
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
  function drive(graph,genome,sensors,k){
    const channel=k%CHANNELS,values=genome.policyWeights;
    const raw=Number.isFinite(sensors?.[channel])?sensors[channel]:0;
    // Generic input normalization only, with no direction or action preference.
    const input=channel<11?raw*2-1:raw;
    return .7*(input*values[channel]+values[CHANNELS+channel]);
  }
  function synapticGains(graph,genome){
    const p=graph.learning,values=genome?.adapterVersion===(p?.version??VERSION)&&genome.policyWeights;
    return Float32Array.from({length:p?.gainGroups??GAIN_GROUPS},(_,g)=>values?Math.exp(clamp(values[CHANNELS*2+g],-.8,.8)):1);
  }
  function commands(graph,brain,genome,enabled=true,edgesEnabled=true){
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
  class EvolutionStrategy{
    constructor(graph){this.graph=graph;const p=graph.learning;this.mean=p.mean.slice();this.sigma=p.scales.slice();this.updates=0;this.episodes=0;}
    update(ranked){
      const eligible=ranked.filter(agent=>valid(this.graph,agent.genome?.policyWeights));
      if(eligible.length<2)return;
      this.updates++;this.episodes+=eligible.length;
      // An identical return supplies no preference signal. Never learn a
      // direction just because an agent happened to be first in the array.
      if(eligible.every(agent=>agent.fitness===eligible[0].fitness))return;
      const count=Math.min(eligible.length,Math.max(2,Math.ceil(eligible.length/4)));
      const weights=Array.from({length:eligible.length},(_,i)=>i<count?Math.log(count+.5)-Math.log(i+1):0),total=weights.reduce((a,b)=>a+b,0);
      weights.forEach((_,i)=>weights[i]/=total);
      // Average tied ranks, including a tie that spans the selection cutoff.
      // Positive affine transformations of rewards leave the update unchanged.
      for(let start=0;start<eligible.length;){
        let end=start+1;while(end<eligible.length&&eligible[end].fitness===eligible[start].fitness)end++;
        const tied=weights.slice(start,end).reduce((a,b)=>a+b,0)/(end-start);
        for(let i=start;i<end;i++)weights[i]=tied;
        start=end;
      }
      const p=this.graph.learning;
      for(let j=0;j<this.mean.length;j++){
        let mean=0;for(let i=0;i<eligible.length;i++)mean+=weights[i]*eligible[i].genome.policyWeights[j];
        let variance=0;for(let i=0;i<eligible.length;i++)variance+=weights[i]*(eligible[i].genome.policyWeights[j]-this.mean[j])**2;
        this.mean[j]=clamp(.35*this.mean[j]+.65*mean,-8,8);
        this.sigma[j]=clamp(Math.sqrt(.85*this.sigma[j]**2+.15*variance),p.scales[j]*.5,p.scales[j]*3);
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
  return {VERSION,CHANNELS,GAIN_GROUPS,CONTROL_INTERVAL,build,valid,supportedVersion,initial,drive,synapticGains,commands,mutate,localMutation,EvolutionStrategy};
});
