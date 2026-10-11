/* Test telemetry and sequential orchestration. No motor policy, teacher,
 * reward change or forced evolution lives here. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.MaleCNSModelTest=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const MODELS=Object.freeze(['v2','v3','v4','v5']);
  const TERMINAL=new Set(['completed','limit','stopped','error']);
  function settings(raw={}){
    const value={circuitId:raw.circuitId||'lab',population:Number(raw.population??16),mutation:Number(raw.mutation??.16),speedMultiplier:Number(raw.speedMultiplier??30),limitSeconds:Number(raw.limitSeconds??600),seed:7717,workerCount:1};
    if(!Number.isInteger(value.population)||value.population<4||value.population>100)throw Error('Scegli da 4 a 100 agenti.');
    if(!Number.isFinite(value.mutation)||value.mutation<0||value.mutation>.35)throw Error('Mutazione non valida (0–35%).');
    if(!Number.isFinite(value.speedMultiplier)||value.speedMultiplier<.5||value.speedMultiplier>30)throw Error('Velocità non valida (0,5–30×).');
    if(!Number.isFinite(value.limitSeconds)||value.limitSeconds<0||value.limitSeconds>86400)throw Error('Limite reale non valido (0–1.440 minuti).');
    return Object.freeze(value);
  }
  class Trial{
    constructor(options,now){
      this.settings=settings(options);this.started=now;this.status='running';this.simSeconds=0;
      this.generations=0;this.currentGeneration=1;this.maxLaps=0;this.bestProgressMeters=0;
      this.hit=null;this.finished=null;this.backend=null;this.error=null;
    }
    get done(){return TERMINAL.has(this.status);}
    observe(sim,now,dt){
      if(this.done)return;
      // Invoked AFTER physical/reward updates and BEFORE the natural reset.
      // Reading renderer snapshots alone can miss the final lap entirely.
      this.simSeconds+=dt;this.currentGeneration=sim.generation;
      const eligible=sim.cars.filter(car=>!car.diagnosticVehicle);
      for(const car of eligible){
        this.maxLaps=Math.max(this.maxLaps,car.laps||0);
        this.bestProgressMeters=Math.max(this.bestProgressMeters,(car.bestProgress||0)/(sim.track.pixelsPerMeter||1));
      }
      if(this.checkLimit(now))return;
      if(!this.hit){
        const completed=eligible.filter(car=>car.laps===2&&car.reason==='limite 2 giri'&&car.lapTimes?.length===2&&car.lapTimes.every(t=>Number.isFinite(t)&&t>0));
        if(completed.length){
          const first=completed.slice().sort((a,b)=>a.lastLapStartTime-b.lastLapStartTime||a.id-b.id)[0];
          this.hit={generation:sim.generation,agentId:first.id,lapTimes:first.lapTimes.slice(),twoLapSimSeconds:first.lapTimes[0]+first.lapTimes[1],wallToTwoLapsSeconds:Math.max(0,(now-this.started)/1000)};
        }
      }
      if(sim.cars.every(car=>!car.alive)){
        this.generations++;
        if(this.hit?.generation===sim.generation){
          this.generationSimSeconds=sim.elapsed;this.finish('completed',now);
        }
      }
    }
    checkLimit(now){
      if(!this.done&&this.settings.limitSeconds>0&&(now-this.started)/1000>=this.settings.limitSeconds)this.finish('limit',now);
      return this.done;
    }
    finish(status,now,error=null){if(this.done)return;this.status=status;this.finished=now;this.error=error;}
    snapshot(now){
      return {status:this.status,wallSeconds:Math.max(0,((this.finished??now)-this.started)/1000),simSeconds:this.simSeconds,generations:this.generations,currentGeneration:this.currentGeneration,maxLaps:this.maxLaps,bestProgressMeters:this.bestProgressMeters,hit:this.hit,generationSimSeconds:this.generationSimSeconds??null,backend:this.backend,error:this.error};
    }
  }
  class Suite{
    constructor({options,version,create,onChange=()=>{}}){
      this.settings=settings(options);this.version=version;this.create=create;this.onChange=onChange;
      this.active=false;this.stopRequested=false;this.current=null;
      this.cases=MODELS.map(modelId=>({modelId,status:'pending'}));
    }
    async run(){
      if(this.active)throw Error('Un test è già in corso.');
      this.active=true;this.startedAt=new Date().toISOString();this.onChange(this);
      try{
        for(const item of this.cases){
          if(this.stopRequested)break;
          let adapter;
          try{
            item.status='loading';this.onChange(this);
            adapter=await this.create(item.modelId,this.settings);this.current=adapter;
            if(this.stopRequested){Object.assign(item,await adapter.cancel());break;}
            await adapter.begin();item.status='running';this.onChange(this);
            while(!TERMINAL.has(item.status)){
              if(this.stopRequested)Object.assign(item,await adapter.cancel());
              else Object.assign(item,adapter.read());
              this.onChange(this);
              if(!TERMINAL.has(item.status))await new Promise(resolve=>setTimeout(resolve,100));
            }
          }catch(error){Object.assign(item,{status:'error',error:error.message});this.onChange(this);}
          finally{this.current=null;if(adapter)await adapter.dispose();}
        }
      }finally{
        if(this.stopRequested)for(const item of this.cases)if(item.status==='pending')item.status='not-run';
        this.active=false;this.finishedAt=new Date().toISOString();this.onChange(this);
      }
      return this.report();
    }
    stop(){this.stopRequested=true;}
    report(){
      return {schema:1,appVersion:this.version,startedAt:this.startedAt,finishedAt:this.finishedAt??null,settings:{...this.settings},execution:'sequential-cold-start',goal:'One real non-diagnostic agent completes two ordered laps, then its generation ends naturally. Failed generations do not meet the goal.',timing:'Wall clock excludes graph loading; simSeconds counts every fixed physical tick, including failed generations. Zero limitSeconds means no wall-time limit.',boundary:'One seed on one circuit; not a statistical convergence or hardware-normalized model ranking. No teacher, route policy, imported champion or forced generation.',cases:JSON.parse(JSON.stringify(this.cases))};
    }
  }
  return Object.freeze({MODELS,settings,Trial,Suite});
});
