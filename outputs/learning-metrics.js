/* Read-only, physical learning metrics. Points are a separate chart mode. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.MaleCNSLearningMetrics=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const median=values=>{const v=values.filter(Number.isFinite).slice().sort((a,b)=>a-b);return v.length?(v[Math.floor((v.length-1)/2)]+v[Math.floor(v.length/2)])/2:null;};
  function summarize(history,track){
    const rows=history||[],last=rows.at(-1),ppm=track.pixelsPerMeter||1;
    const recent=rows.slice(-5),prior=rows.slice(-10,-5),current=median(recent.map(h=>h.bestProgress/ppm)),previous=median(prior.map(h=>h.bestProgress/ppm));
    const ready=recent.length===5&&prior.length===5,delta=ready?current-previous:null;
    return {generations:rows.length,generation:last?.generation??null,distance:last?last.bestProgress/ppm:null,meanDistance:last?last.meanProgress/ppm:null,
      maxLaps:rows.length?Math.max(...rows.map(h=>h.maxLaps??h.laps??0)):0,
      lapTime:rows.some(h=>Number.isFinite(h.bestLapTime))?Math.min(...rows.map(h=>Number.isFinite(h.bestLapTime)?h.bestLapTime:Infinity)):null,
      recentMedian:current,previousMedian:previous,delta,trend:!ready?'pending':Math.abs(delta)<1?'stable':delta>0?'improving':'regressing',
      stagnation:last?.stagnation??0,immigrants:last?.immigrantCount??0,updates:last?.learning?.updates??0};
  }
  function series(history,track,mode='progress'){
    const rows=history.slice(-32),ppm=track.pixelsPerMeter||1;
    const points=mode==='fitness'?rows.map(h=>({generation:h.generation,best:h.best,mean:h.mean})):rows.map(h=>({generation:h.generation,best:h.bestProgress/ppm,mean:h.meanProgress/ppm}));
    return {points,min:mode==='fitness'?Math.min(0,...points.flatMap(p=>[p.best,p.mean])):0,max:Math.max(1,...points.flatMap(p=>[p.best,p.mean])),unit:mode==='fitness'?'pt':'m'};
  }
  return Object.freeze({median,summarize,series});
});
