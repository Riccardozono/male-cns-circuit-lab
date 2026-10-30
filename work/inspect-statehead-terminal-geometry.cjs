'use strict';
// Geometry-only audit of saved terminal coordinates from an exact replay.
// No vehicle is stepped; this tests the real V3/Monza road and collision geometry.
const fs=require('node:fs'),path=require('node:path');
const Model=require('./neural-statehead-cuda-model.cjs');
const root=path.resolve(__dirname,'..'),source=path.join(root,'.impeccable/review/learning-ml/statehead-zero-vs-learned-20261020-01/report.json');
function angleDelta(a,b){let d=(a-b+Math.PI)%(2*Math.PI);if(d<0)d+=2*Math.PI;return d-Math.PI;}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  const replay=JSON.parse(fs.readFileSync(source,'utf8')),selected=Model.defaultChoice(),loaded=Model.load(selected.file);
  const env=Model.createFromLoaded(loaded,{weights:Array(18).fill(0),id:0}),track=env.track,runtime=env.runtime;
  try{
    const results=replay.results.map(row=>{
      const point=row.segments.lap2.at(-1),car={x:point.x,y:point.y,heading:point.heading,pixelsPerMeter:track.pixelsPerMeter};
      const nearest=runtime.locate(track,car.x,car.y),seg=track.segments.find(s=>nearest.along>=s.start-1e-9&&nearest.along<=s.start+s.length+1e-9)||track.segments.at(-1);
      const tangent=Math.atan2(seg.b.y-seg.a.y,seg.b.x-seg.a.x),width=runtime.trackWidthAt(track,nearest.along),rays=runtime.sensorDistances(track,car);
      return {name:row.name,position:{x:car.x,y:car.y,heading:car.heading},progressAlongLap:point.along,
        geometry:{roadCenterlineAlong:nearest.along,centerlineOffsetUnits:nearest.distance,centerlineOffsetMetres:nearest.distance/track.pixelsPerMeter,
          roadWidthMetres:width.widthMeters,roadLabel:width.label,onRoad:runtime.onRoad(track,car.x,car.y),vehicleIntersectsWall:runtime.collided(track,car),
          headingErrorDegrees:angleDelta(car.heading,tangent)*180/Math.PI,segmentIndex:track.segments.indexOf(seg)},
        raysUnits:rays,outputs:point.outputs,speedMps:point.speedMps};
    });
    const report={format:'male-cns-statehead-terminal-road-geometry-audit-v1',appVersion:'5.6.0',trackLengthUnits:track.total,pixelsPerMeter:track.pixelsPerMeter,
      method:'Reuses terminal coordinates from the exact paired replay and queries the actual simulator Monza centerline, track polygon, oriented Porsche wall collision and sensor rays. No neural or physical step is run.',results,
      boundary:'A terminal geometry snapshot identifies whether each stopped vehicle is on-road and near a wall; it does not itself explain the policy decision or prove track fidelity to real-world surveyed data.'};
    const out=path.join(root,'.impeccable/review/learning-ml/statehead-terminal-geometry-20261020-01');
    if(fs.existsSync(out))throw Error('Refusing to overwrite an existing geometry audit');
    fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
    console.log('STATEHEAD_TERMINAL_GEOMETRY '+JSON.stringify({results:results.map(r=>({name:r.name,geometry:r.geometry,raysUnits:r.raysUnits})),report:path.join(out,'report.json')}));
  }finally{Model.closeCuda();}
}
main().catch(error=>{console.error(error.stack||error);Model.closeCuda();process.exitCode=1;});
