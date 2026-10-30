/* Read-only, physical learning metrics. Points are a separate chart mode. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.MaleCNSLearningMetrics=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const median=values=>{const v=values.filter(Number.isFinite).slice().sort((a,b)=>a-b);return v.length?(v[Math.floor((v.length-1)/2)]+v[Math.floor(v.length/2)])/2:null;};
  const bestProgress=h=>Number.isFinite(h?.bestSafeProgress)?h.bestSafeProgress:(Number(h?.bestProgress)||0);
  const meanProgress=h=>Number.isFinite(h?.meanSafeProgress)?h.meanSafeProgress:(Number(h?.meanProgress)||0);
  function summarize(history,track){
    const rows=history||[],last=rows.at(-1),ppm=track.pixelsPerMeter||1;
    const recent=rows.slice(-5),prior=rows.slice(-10,-5),current=median(recent.map(h=>bestProgress(h)/ppm)),previous=median(prior.map(h=>bestProgress(h)/ppm));
    const ready=recent.length===5&&prior.length===5,delta=ready?current-previous:null;
    const safeRows=rows.filter(h=>Number.isFinite(h.bestSafeProgress)),progressBasis=!rows.length||safeRows.length===rows.length?'safe':safeRows.length?'mixed':'legacy';
    return {generations:rows.length,generation:last?.generation??null,distance:last?bestProgress(last)/ppm:null,rawDistance:last&&Number.isFinite(last.bestProgress)?last.bestProgress/ppm:null,meanDistance:last?meanProgress(last)/ppm:null,progressBasis,
      maxLaps:rows.length?Math.max(...rows.map(h=>h.maxLaps??h.laps??0)):0,
      lapTime:rows.some(h=>Number.isFinite(h.bestLapTime))?Math.min(...rows.map(h=>Number.isFinite(h.bestLapTime)?h.bestLapTime:Infinity)):null,
      recentMedian:current,previousMedian:previous,delta,trend:!ready?'pending':Math.abs(delta)<1?'stable':delta>0?'improving':'regressing',
      stagnation:last?.stagnation??0,immigrants:last?.immigrantCount??0,updates:last?.learning?.updates??0};
  }
  function series(history,track,mode='progress'){
    const rows=history.slice(-32),ppm=track.pixelsPerMeter||1;
    const fitness=mode==='fitness',raw=mode==='raw-progress';
    const points=fitness?rows.map(h=>({generation:h.generation,best:h.best,mean:h.mean})):raw?rows.map(h=>({generation:h.generation,best:(Number(h.bestProgress)||0)/ppm,mean:(Number(h.meanProgress)||0)/ppm})):rows.map(h=>({generation:h.generation,best:bestProgress(h)/ppm,mean:meanProgress(h)/ppm}));
    return {points,min:fitness?Math.min(0,...points.flatMap(p=>[p.best,p.mean])):0,max:Math.max(1,...points.flatMap(p=>[p.best,p.mean])),unit:fitness?'pt':'m',basis:fitness?'fitness':raw?'raw':'safe'};
  }
  return Object.freeze({median,summarize,series});
});
