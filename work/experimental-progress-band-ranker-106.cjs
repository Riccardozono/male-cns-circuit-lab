'use strict';

// Research-only ranking for completed outcomes. It never supplies actions,
// sensor values, target trajectories, or an alternative vehicle controller.
// Near-equal, collision-free progress is grouped in 5 m bands anchored at
// that generation's furthest safe no-lap result; within a band the actual
// reward/penalties decide. The furthest lineage is separately retained by the
// existing simulator. A fixed generation anchor makes the comparator transitive.
function makeRanker(safeOutcomes,pixelsPerMeter,helpers,bandMeters=5){
  const {isSafeLearningOutcome,compareLearningAgents,compareOptimizerAgents}=helpers;
  if(!Array.isArray(safeOutcomes)||!Number.isFinite(pixelsPerMeter)||pixelsPerMeter<=0||
     !Number.isFinite(bandMeters)||bandMeters<=0)throw Error('Invalid experimental ranker input');
  const noLap=safeOutcomes.filter(c=>(Number(c.laps)||0)===0);
  const frontier=noLap.reduce((max,c)=>Math.max(max,Number(c.bestProgress)||0),0);
  const width=bandMeters*pixelsPerMeter;
  const band=c=>Math.floor(Math.max(0,frontier-(Number(c.bestProgress)||0))/width+1e-12);
  return (a,b)=>{
    if(!isSafeLearningOutcome(a)||!isSafeLearningOutcome(b))return compareOptimizerAgents(a,b);
    if((Number(a.laps)||0)!==0||(Number(b.laps)||0)!==0)return compareLearningAgents(a,b);
    const aBand=band(a),bBand=band(b);if(aBand!==bBand)return aBand-bBand;
    const aFitness=Number.isFinite(a.fitness)?a.fitness:-Infinity,bFitness=Number.isFinite(b.fitness)?b.fitness:-Infinity;
    if(aFitness!==bFitness)return aFitness>bFitness?-1:1;
    return compareLearningAgents(a,b);
  };
}
module.exports={makeRanker};
