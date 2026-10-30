'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const F=require(path.join(root,'outputs/simulation.js')),P=require(path.join(root,'outputs/progress-save.js')),
  Legacy=require(path.join(root,'outputs/legacy-models.js')),Learning=require(path.join(root,'outputs/neural-learning.js'));
const H=8;
async function main(){
  const decoded=await P.decode(fs.readFileSync(savePath,'utf8'),'5.6.0'),state=decoded.payload.workers[0].state,
    data=Legacy.tagV3(JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8'))),circuits=require(path.join(root,'outputs/data/circuits.json')),
    sim=new F.Simulation(data,{modelId:'v3',population:state.population,circuitId:'monza',circuits,seed:state.seed});
  P.restore(sim,state);const source=sim.cars[3].genome,graph=sim.graph,n=graph.learning.nodes.length,p=graph.learning.length,
    residualLength=n*H+H+H*2+2,extra=Array(residualLength).fill(0),rng=F.rng(7717);
  for(let i=0;i<n*H;i++){let a=0;do{a=rng();}while(a<=0);extra[i]=Math.sqrt(-2*Math.log(a))*Math.cos(2*Math.PI*rng())*.7;}
  const a=F.makeCar(sim.track,0,F.cloneGenome(source),'progress-3'),b=F.makeCar(sim.track,0,{...F.cloneGenome(source),policyWeights:[...source.policyWeights,...extra]},'progress-3');
  F.Rewards.initialise(sim.track,a,null,'progress-3');F.Rewards.initialise(sim.track,b,null,'progress-3');
  const brainA=F.makeBrain(graph),brainB=F.makeBrain(graph),old=Learning.commands;let actionDiff=null,positionDiff=null,completed=0;
  Learning.commands=(g,brain,genome,enabled=true,edgesEnabled=true)=>{
    const values=genome.policyWeights;if(values.length===p)return old(g,brain,genome,enabled,edgesEnabled);
    const base=old(g,brain,{...genome,policyWeights:values.slice(0,p)},enabled,edgesEnabled),residualOffset=p,hiddenOffset=p+n*H,output=hiddenOffset+H;
    if(values.slice(output).every(v=>v===0))return base;
    const features=brain.policyFeatures,hidden=new Float64Array(H),norm=1/Math.sqrt(n);
    for(let h=0;h<H;h++){let sum=values[hiddenOffset+h];for(let i=0;i<n;i++)sum+=features[i]*values[residualOffset+i*H+h]*norm;hidden[h]=Math.tanh(sum);}
    let steer=0,longitudinal=0;for(let h=0;h<H;h++){steer+=hidden[h]*values[output+h*2]*Math.SQRT1_2;longitudinal+=hidden[h]*values[output+h*2+1]*Math.SQRT1_2;}
    steer+=values[values.length-2];longitudinal+=values[values.length-1];const logit=v=>Math.atanh(F.clamp(v,-1+1e-12,1-1e-12));
    const s=Math.tanh(logit(base[0])+steer),l=Math.tanh(logit(base[1]-base[2])+longitudinal);return [s,Math.max(0,l),Math.max(0,-l)];
  };
  try{
    let commandsA=[0,0,0],commandsB=[0,0,0];const limit=2400;
    for(let tick=0;tick<limit&&a.alive&&b.alive;tick++){
      if(tick%Learning.CONTROL_INTERVAL===0){
        a.inputs=F.sense(sim.track,a);a.physicsInputs=F.physicsSense(a,sim.track);a.sensorVector=a.inputs.concat(a.physicsInputs);
        b.inputs=F.sense(sim.track,b);b.physicsInputs=F.physicsSense(b,sim.track);b.sensorVector=b.inputs.concat(b.physicsInputs);
        commandsA=F.neuralStep(graph,brainA,a.genome,a.sensorVector,true,true,F.MAP_PHYSICS_ADAPTER_GAIN,F.MAP_NEURAL_MOTOR_LAUNCH_BIAS);
        commandsB=F.neuralStep(graph,brainB,b.genome,b.sensorVector,true,true,F.MAP_PHYSICS_ADAPTER_GAIN,F.MAP_NEURAL_MOTOR_LAUNCH_BIAS);
        const diff=Math.max(...commandsA.map((v,i)=>Math.abs(v-commandsB[i])));if(diff>0&&!actionDiff)actionDiff={tick,diff,a:commandsA,b:commandsB};
      }
      F.drive(sim.track,a,commandsA,F.DT);F.drive(sim.track,b,commandsB,F.DT);completed=tick+1;
      const pos=Math.hypot(a.x-b.x,a.y-b.y);if(pos>1e-10&&!positionDiff)positionDiff={tick,metres:pos,a:{x:a.x,y:a.y},b:{x:b.x,y:b.y}};
    }
    console.log(JSON.stringify({policyNodes:n,basePolicyLength:p,residualLength,completed,actionDiff,positionDiff,
      baseline:{x:a.x,y:a.y,progress:a.bestProgress/(sim.track.pixelsPerMeter||1),alive:a.alive},residual:{x:b.x,y:b.y,progress:b.bestProgress/(sim.track.pixelsPerMeter||1),alive:b.alive}},null,2));
  }finally{Learning.commands=old;}
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
