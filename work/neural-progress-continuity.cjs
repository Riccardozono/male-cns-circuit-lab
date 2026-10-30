'use strict';
// Reward geometry only. These values never enter the neural controller.
// A local exception requires both successive projections to be reproduced
// from actual body positions on adjacent segments, in the correct Voronoi
// order. Segment indices alone cannot authorize a chainage jump.
function project(segment,x,y){
  const dx=segment.b.x-segment.a.x,dy=segment.b.y-segment.a.y,t=Math.max(0,Math.min(1,((x-segment.a.x)*dx+(y-segment.a.y)*dy)/(dx*dx+dy*dy)));
  return {along:segment.start+t*segment.length,distance:Math.hypot(x-segment.a.x-t*dx,y-segment.a.y-t*dy)};
}
function localTransition(track,state,x,y,along,segmentIndex,{onRoad,collision,dt}){
  const segments=track.segments,count=segments?.length||0,previous=state.segmentIndex,ppm=track.pixelsPerMeter||1;
  if(!onRoad||collision||!Number.isInteger(previous)||!Number.isInteger(segmentIndex)||previous<0||previous>=count||segmentIndex<0||segmentIndex>=count||
    ![state.x,state.y,state.along,x,y,along,dt].every(Number.isFinite)||dt<=0||!(track.total>0))return false;
  const gap=Math.abs(previous-segmentIndex);if(gap!==1&&gap!==count-1)return false;
  const moved=Math.hypot(x-state.x,y-state.y);if(moved<=1e-6*ppm||moved>120*ppm*dt+1e-6*ppm)return false;
  const oldSegment=segments[previous],newSegment=segments[segmentIndex],old=project(oldSegment,state.x,state.y),next=project(newSegment,x,y),
    oldOnNew=project(newSegment,state.x,state.y),nextOnOld=project(oldSegment,x,y),epsilon=1e-6*ppm;
  return Math.abs(old.along-state.along)<=epsilon&&Math.abs(next.along-along)<=epsilon&&
    old.distance<=oldOnNew.distance+epsilon&&next.distance<=nextOnOld.distance+epsilon;
}
module.exports={localTransition,project};
