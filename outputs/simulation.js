/* Dynamic cars + ray casting. CommonJS export also supports headless tests.
 * Track geometry is used for spawning, sensing, collisions and scoring ONLY.
 * No projection onto the route is ever applied to a moving car.
 * Cars have independent rigid-body state (longitudinal/lateral velocity and yaw
 * rate). There is deliberately no car-car collision or drafting interaction.
 */
(function(root) {
  'use strict';
  const Learning=typeof module!=='undefined'&&module.exports?require('./neural-learning.js'):root.MaleCNSLearning;
  const Vehicle=typeof module!=='undefined'&&module.exports?require('./vehicle-992.js'):root.MaleCNSVehicle;
  const Rewards=typeof module!=='undefined'&&module.exports?require('./rewards.js'):root.MaleCNSRewards;
  if(!Vehicle)throw Error('Modello fisico Porsche mancante');
  if(!Rewards)throw Error('Sistema di ricompense mancante');
  const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
  function normalizeDriveCommands(commands) {
    const read = value => Number.isFinite(value) ? Number(value) : 0;
    const steering = clamp(read(commands?.[0]),-1,1);
    let throttle = clamp(read(commands?.[1]),0,1);
    let brake = clamp(read(commands?.[2]),0,1);
    // Throttle and brake are independent neural channels, but they share one
    // longitudinal actuator. Applying both at once makes the car burn force
    // while the inspector suggests two simultaneous commands. Keep the
    // same net longitudinal request as `engine - brake`, expose only one
    // effective actuator channel, and let an exact tie cancel to zero.
    if(brake>=throttle) { brake-=throttle; throttle=0; }
    else { throttle-=brake; brake=0; }
    return [steering,throttle,brake];
  }
  const TAU = Math.PI*2, DT = 1/60, SENSOR_MAX = 240, MAX_SPEED = 120;
  // Dynamics now run in SI. Map coordinates remain display/scoring units;
  // each circuit has an explicit length-based pixels/metre conversion.
  const PHYSICS=Object.freeze({
    pixelsPerMeter:1,gravity:Vehicle.G,vehicleMass:Vehicle.SPEC.baseMassKg,
    wheelBase:Vehicle.SPEC.wheelbaseM,maxSteerAngle:.58,tireGrip:Vehicle.MODEL.tyreMu,maxYawRate:4.5,
    revision:Vehicle.REVISION
  });
  // Deliberately strict synthetic scoring: completing a lap slowly must not
  // beat a shorter, cleaner lap just because the car survived longer.
  // The two longitudinal MaleCNS outputs are treated as competing logits,
  // rather than two positive pedals that are later allowed to cancel almost
  // completely. The small launch bias only prevents a fresh population from
  // getting stuck at zero velocity before it has produced any progress
  // signal; a sufficiently negative neural brake logit still stops the car.
  const NEURAL_MOTOR_GAIN=.35;
  // Map circuits are narrow (8 px half-width). A smaller neutral launch
  // request gives fresh genomes time to discover braking/steering before the
  // first corner, without adding a route cue or changing the connectome.
  const NEURAL_MOTOR_LAUNCH_BIAS=.18;
  const MAP_NEURAL_MOTOR_LAUNCH_BIAS=.02;
  const SCORE_RULES=Rewards.RULES;
  // Evolution must preserve useful partial solutions while retaining enough
  // variation to escape a controller that only drives straight into the first
  // wall. These rules affect the adapter genome, not the connectome itself.
  const EVOLUTION_RULES=Object.freeze({
    eliteCount:4,
    parentPoolFraction:.5,
    crossoverRate:.76,
    immigrantRate:.16,
    stagnationWindow:3,
    stagnationMutationMultiplier:1.5,
    mutationFloor:.035,
    mutationCeiling:.35,
    progressTieTolerance:1,
    hallOfFameCount:4,
    explorerRate:.14,
    hyperMutationRate:.12,
    calmMutationRate:.18
  });
  const MAX_POPULATION=100,LEGACY_VISUAL_SENSOR_COUNT=7,PREVIOUS_SENSOR_COUNT=14,LEGACY_ENCODER_LENGTH=LEGACY_VISUAL_SENSOR_COUNT*2,PREVIOUS_ENCODER_LENGTH=PREVIOUS_SENSOR_COUNT*2,V2_ITERATIONS_PER_CONTROL_TICK=2,V3_ITERATIONS_PER_CONTROL_TICK=4;
  // Eleven rays give the adapter earlier information about chicanes and
  // corner entry without introducing a centre-line or route-following cue.
  // Every value still comes from a real intersection with the circuit walls.
  // Keep the original seven channels in positions 0..6 so saved V2/V3
  // adapters retain their meaning; the four wider-angle rays are appended as
  // new learnable inputs.
  const ANGLES = [-1.25,-0.8,-0.4,0,0.4,0.8,1.25,-1.45,-1.05,1.05,1.45];
  const VISUAL_SENSOR_COUNT=ANGLES.length,VEHICLE_PHYSICS_SENSOR_COUNT=7,ROAD_PHYSICS_SENSOR_COUNT=4,POWERTRAIN_SENSOR_COUNT=6,PHYSICS_SENSOR_COUNT=VEHICLE_PHYSICS_SENSOR_COUNT+ROAD_PHYSICS_SENSOR_COUNT+POWERTRAIN_SENSOR_COUNT,SENSOR_COUNT=VISUAL_SENSOR_COUNT+PHYSICS_SENSOR_COUNT,PHYSICS_RELAY_PER_SENSOR=16,PHYSICS_RELAY_COUNT=VEHICLE_PHYSICS_SENSOR_COUNT*PHYSICS_RELAY_PER_SENSOR,ROAD_RELAY_COUNT=PHYSICS_RELAY_COUNT,PHYSICS_ADAPTER_GAIN=.35,MAP_PHYSICS_ADAPTER_GAIN=.8;
  const POINTS = [[230,500],[185,355],[270,215],[475,150],[745,165],[950,260],
    [1000,400],[910,520],[795,560],[735,645],[535,655],[350,605]];
  function rng(seed) { const random=() => { let t=seed+=0x6D2B79F5; t=Math.imul(t^t>>>15,t|1); t^=t+Math.imul(t^t>>>7,t|61); return ((t^t>>>14)>>>0)/4294967296; }; random.getState=()=>seed;return random; }
  function normal(random) { return Math.sqrt(-2*Math.log(Math.max(1e-9,random())))*Math.cos(TAU*random()); }
  function cross(ax,ay,bx,by) { return ax*by-ay*bx; }
  function pointSegment(x,y,a,b) {
    const dx=b.x-a.x,dy=b.y-a.y;
    const t=clamp(((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy),0,1);
    return {x:a.x+t*dx,y:a.y+t*dy,t,distance:Math.hypot(x-a.x-t*dx,y-a.y-t*dy)};
  }
  function makeTrack(points=POINTS,halfWidth=49,sampled=false,boundaries=null,definition=null) {
    const center=[];
    if(sampled) {
      for(const [x,y] of points) {
        const last=center[center.length-1];
        if(!last || Math.hypot(x-last.x,y-last.y)>1e-5)center.push({x,y});
      }
      if(Math.hypot(center[0].x-center.at(-1).x,center[0].y-center.at(-1).y)<1e-5)center.pop();
    }
    for(let i=0;!sampled && i<points.length;i++) {
      const p=[points[(i-1+points.length)%points.length],points[i],points[(i+1)%points.length],points[(i+2)%points.length]];
      for(let j=0;j<20;j++) {
        const t=j/20,t2=t*t,t3=t2*t;
        const at=k=>0.5*(2*p[1][k]+(-p[0][k]+p[2][k])*t+(2*p[0][k]-5*p[1][k]+4*p[2][k]-p[3][k])*t2+(-p[0][k]+3*p[1][k]-3*p[2][k]+p[3][k])*t3);
        center.push({x:at(0),y:at(1)});
      }
    }
    const outer=[],inner=[],walls=[],segments=[];
    let total=0;
    center.forEach((p,i)=>{
      const before=center[(i-1+center.length)%center.length],after=center[(i+1)%center.length];
      const angle=Math.atan2(after.y-before.y,after.x-before.x);
      const nx=-Math.sin(angle),ny=Math.cos(angle);
      outer.push({x:p.x+nx*halfWidth,y:p.y+ny*halfWidth});
      inner.push({x:p.x-nx*halfWidth,y:p.y-ny*halfWidth});
      const length=Math.hypot(after.x-p.x,after.y-p.y);
      segments.push({a:p,b:after,length,start:total}); total+=length;
    });
    if(boundaries) {
      outer.splice(0,outer.length,...boundaries[0].map(([x,y])=>({x,y})));
      inner.splice(0,inner.length,...boundaries[1].map(([x,y])=>({x,y})));
    }
    for(const boundary of [outer,inner]) boundary.forEach((p,i)=>walls.push({a:p,b:boundary[(i+1)%boundary.length]}));
    for(const wall of walls) {
      wall.minX=Math.min(wall.a.x,wall.b.x);wall.maxX=Math.max(wall.a.x,wall.b.x);
      wall.minY=Math.min(wall.a.y,wall.b.y);wall.maxY=Math.max(wall.a.y,wall.b.y);
    }
    const all=[...outer,...inner],minX=Math.min(...all.map(p=>p.x)),minY=Math.min(...all.map(p=>p.y));
    const maxX=Math.max(...all.map(p=>p.x)),maxY=Math.max(...all.map(p=>p.y));
    const widthMeters=definition?.widthMeters||null,widthStations=definition?.widthStations||[],dimensions=definition?.dimensions||null;
    if(widthMeters&&(widthMeters.length!==center.length||!widthMeters.every(w=>Number.isFinite(w)&&w>0)))throw Error('Profilo di larghezza del circuito non valido.');
    return {center,outer,inner,walls,segments,total,halfWidth,vehicleScale:1,widthMeters,widthStations,dimensions,explicitBoundaries:Boolean(boundaries),
      bounds:sampled?{x:minX-100,y:minY-100,width:maxX-minX+200,height:maxY-minY+200}:{x:0,y:0,width:1200,height:760}};
  }
  function locate(track,x,y) {
    let closest={distance:Infinity};
    for(const seg of track.segments) {
      const p=pointSegment(x,y,seg.a,seg.b);
      if(p.distance<closest.distance) closest={...p,along:seg.start+p.t*seg.length};
    }
    return closest;
  }
  // Observation/painting metadata only. Never sent as a neural input or
  // steering/throttle target; road sensors still intersect the real walls.
  function trackWidthAt(track,along=0) {
    const d=along>=0&&along<track.total?along:((along%track.total)+track.total)%track.total,segs=track.segments;
    let lo=0,hi=segs.length;while(lo+1<hi){const m=(lo+hi)>>1;if(segs[m].start<=d)lo=m;else hi=m;}
    const t=(d-segs[lo].start)/Math.max(1e-12,segs[lo].length),w=track.widthMeters;
    const stations=track.widthStations||[];let station=null;
    // Chainage and world coordinates are metric in revision 2 catalogs.
    for(const s of stations){if(s.alongMeters<=d+1e-9)station=s;else break;}
    return {widthMeters:w?w[lo]+(w[(lo+1)%w.length]-w[lo])*t:track.halfWidth*2/(track.pixelsPerMeter||1),
      alongMeters:d/(track.pixelsPerMeter||1),label:station?.label||'Pista di laboratorio',estimated:Boolean(track.dimensions?.widthEstimated),station};
  }
  function onRoad(track,x,y) {
    const inside=ring=>{let result=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){
      const a=ring[i],b=ring[j];if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)result=!result;
    }return result;};
    return inside(track.outer)&&!inside(track.inner);
  }
  function raycast(track,x,y,angle,max=SENSOR_MAX) {
    const dx=Math.cos(angle),dy=Math.sin(angle); let distance=max;
    const minX=Math.min(x,x+dx*max),maxX=Math.max(x,x+dx*max),minY=Math.min(y,y+dy*max),maxY=Math.max(y,y+dy*max);
    for(const wall of track.walls) {
      if(wall.maxX<minX || wall.minX>maxX || wall.maxY<minY || wall.minY>maxY)continue;
      const sx=wall.b.x-wall.a.x,sy=wall.b.y-wall.a.y;
      const denominator=cross(dx,dy,sx,sy);
      if(Math.abs(denominator)<1e-9) continue;
      const qx=wall.a.x-x,qy=wall.a.y-y;
      const t=cross(qx,qy,sx,sy)/denominator,u=cross(qx,qy,dx,dy)/denominator;
      if(t>=0 && t<distance && u>=0 && u<=1) distance=t;
    }
    return distance;
  }
  const rayCache=new WeakMap();
  function sense(track,car) {
    // Keep narrow map-derived profiles observable while retaining a graded
    // long-range warning before a chicane. The rays still hit only real walls;
    // this is a monotonic sensor encoding, not a route or centerline shortcut.
    const narrowProfile=track.halfWidth<20,sensorRange=Math.max(32,Math.min(SENSOR_MAX,track.halfWidth*5));
    return sensorDistances(track,car).map((distance,index)=>{
      const normalized=clamp(distance/SENSOR_MAX,0,1);
      // Preserve the close wall sensitivity on the side rays, while the
      // forward ray keeps its long-range distance gradient before braking
      // zones on the map-derived circuits.
      return narrowProfile?(index===3?normalized:clamp(distance/sensorRange,0,1)):normalized;
    });
  }
  function sensorDistances(track,car) {
    const cached=rayCache.get(car);
    if(cached&&cached.track===track&&cached.x===car.x&&cached.y===car.y&&cached.heading===car.heading)return cached.distances;
    const distances=ANGLES.map(angle=>raycast(track,car.x,car.y,car.heading+angle));
    rayCache.set(car,{track,x:car.x,y:car.y,heading:car.heading,distances});return distances;
  }
  function roadSense(track,car) {
    if(!track) return Array(ROAD_PHYSICS_SENSOR_COUNT).fill(0);
    const distances=sensorDistances(track,car),narrowProfile=track.halfWidth<20,sensorRange=Math.max(32,Math.min(SENSOR_MAX,track.halfWidth*5));
    const nearLeft=(distances[1]+distances[2]+distances[0]*.35)/2.35,nearRight=(distances[4]+distances[5]+distances[6]*.35)/2.35;
    const farLeft=(distances[0]+distances[7])*.5,farRight=(distances[6]+distances[10])*.5;
    // These channels are derived exclusively from intersections with the
    // actual closed walls. They provide a compact preview of corridor
    // asymmetry without using center-line progress or prescribing a route.
    return [
      clamp((nearRight-nearLeft)/Math.max(1,nearLeft+nearRight),-1,1),
      clamp((farRight-farLeft)/Math.max(1,farLeft+farRight),-1,1),
      clamp(distances[3]/SENSOR_MAX,0,1),
      clamp((nearLeft+nearRight)/(2*(narrowProfile?sensorRange:SENSOR_MAX)),0,1)
    ];
  }
  function physicsSense(car,track=null) {
    const v=car.vehicle,t=v?.wheels?Vehicle.telemetry(v):v;
    return [
      clamp((car.vehicle?.speedMps??car.speed/(car.pixelsPerMeter||1))/100,0,1),
      clamp(car.longitudinalG/2.5,-1,1),
      clamp(car.lateralG/2.5,-1,1),
      clamp(car.totalG/3,0,1),
      clamp(car.slipAngle/(Math.PI/2),-1,1),
      clamp(car.yawRate/PHYSICS.maxYawRate,-1,1),
      clamp(car.loadTransfer,-1,1),
      ...roadSense(track,car),
      // Append powertrain feedback: do not change existing road-channel order.
      clamp((v?.rpm||0)/Vehicle.SPEC.maxRpm,0,1),clamp((v?.gear||0)/6,-1,1),
      clamp(t?.rearSlip||0,-1,1),clamp(t?.frontSlip||0,-1,1),
      clamp((t?.tyreC||0)/150,0,1),clamp((t?.brakeC||0)/1000,0,1)
    ];
  }
  function makeCar(track,id=0,genome=null) {
    const a=track.center[0],b=track.center[1];
    const ppm=track.pixelsPerMeter||1;
    const car=Rewards.initialise(track,{id,genome,x:a.x,y:a.y,heading:Math.atan2(b.y-a.y,b.x-a.x),speed:0,steer:0,scale:Vehicle.SPEC.lengthM*ppm/24,
      pixelsPerMeter:ppm,vehicle:Vehicle.createState(),
      velocityX:0,velocityY:0,longitudinalVelocity:0,lateralVelocity:0,yawRate:0,
      longitudinalAcceleration:0,lateralAcceleration:0,longitudinalG:0,lateralG:0,totalG:0,loadTransfer:0,slipAngle:0,_physicsSpeed:0,
      noLapPenalty:0,lapRegressionPenalty:0,previousGenerationLapTime:null,lapRegression:0,noLapPenaltyApplied:false,lapRegressionPenaltyApplied:false,
      alive:true,reason:'',distance:0,progress:0,lastAlong:0,bestProgress:0,fitness:0,reward:0,penalty:0,lastReward:0,lastPenalty:0,
      laps:0,lapTimes:[],lastLapTime:null,lastLapReward:0,lastLapPenalty:0,bestLapTime:Infinity,lastLapStartTime:0,
      lifetime:0,lastProgressTime:0,inputs:Array(VISUAL_SENSOR_COUNT).fill(0),physicsInputs:Array(PHYSICS_SENSOR_COUNT).fill(0),sensorVector:Array(SENSOR_COUNT).fill(0),outputs:[0,0,0],trail:[],brain:null});
    Vehicle.placeOnSurface(car,Vehicle.Terrain.forTrack(track));return car;
  }
  function collided(track,car) {
    // Exact oriented 4.619 x 2.050 m envelope against the EXISTING walls.
    // Ghost cars: this function deliberately never receives other cars.
    const cos=Math.cos(car.heading),sin=Math.sin(car.heading),ppm=car.pixelsPerMeter||1;
    const hx=Vehicle.SPEC.lengthM*.5*ppm,hy=Vehicle.SPEC.widthM*.5*ppm;
    const wx=Math.abs(cos)*hx+Math.abs(sin)*hy,wy=Math.abs(sin)*hx+Math.abs(cos)*hy;
    for(const wall of track.walls){
      if(wall.maxX<car.x-wx||wall.minX>car.x+wx||wall.maxY<car.y-wy||wall.minY>car.y+wy)continue;
      const ax=(wall.a.x-car.x)*cos+(wall.a.y-car.y)*sin,ay=-(wall.a.x-car.x)*sin+(wall.a.y-car.y)*cos;
      const bx=(wall.b.x-car.x)*cos+(wall.b.y-car.y)*sin,by=-(wall.b.x-car.x)*sin+(wall.b.y-car.y)*cos;
      let lo=0,hi=1;
      for(const [start,delta,half]of [[ax,bx-ax,hx],[ay,by-ay,hy]]){
        if(Math.abs(delta)<1e-12){if(start< -half||start>half){hi=-1;break;}}
        else {const a=(-half-start)/delta,b=(half-start)/delta;lo=Math.max(lo,Math.min(a,b));hi=Math.min(hi,Math.max(a,b));if(lo>hi)break;}
      }
      if(lo<=hi)return true;
    }
    return false;
  }
  function drive(track,car,commands,dt=DT) {
    if(!car.alive) return;
    const [steering,throttle,brake]=normalizeDriveCommands(commands);
    car.outputs=[steering,throttle,brake];
    Vehicle.step(car,car.outputs,dt,Vehicle.Terrain.forTrack(track));
    const nearest=locate(track,car.x,car.y);
    Rewards.step(track,car,{along:nearest.along,onRoad:track.explicitBoundaries?onRoad(track,car.x,car.y):nearest.distance<=track.halfWidth+5,
      collision:collided(track,car),forwardClearance:raycast(track,car.x,car.y,car.heading),dt});
    if(!car.alive)Vehicle.stop(car);
  }
  function compileGraph(data) {
    if(!data) throw Error('Dataset MaleCNS mancante o vuoto. Nessun controller sostitutivo.');
    const compact=data.compact===true,n=compact?data.nodeCount:data.nodes?.length;
    if(!Number.isInteger(n)||n<1)throw Error('Dataset MaleCNS mancante o vuoto. Nessun controller sostitutivo.');
    let from=null,to=null,weights,rowOffsets,targets,csrWeights,nodes=compact?null:data.nodes;
    if(compact){
      const edgeCount=data.edgeCount;
      if(!(data.bodyIds instanceof Float64Array)||data.bodyIds.length!==n||!(data.positions instanceof Int32Array)||data.positions.length!==n*3||!(data.classCodes instanceof Uint8Array)||data.classCodes.length!==n||!(data.sideCodes instanceof Int8Array)||data.sideCodes.length!==n||!(data.coreMask instanceof Uint8Array)||data.coreMask.length!==n)throw Error('Metadati neuronali MaleCNS completi non validi');
      if(!(data.rowOffsets instanceof Uint32Array)||data.rowOffsets.length!==n+1||!(data.targets instanceof Uint32Array)||data.targets.length!==edgeCount||!(data.weights instanceof Float32Array)||data.weights.length!==edgeCount||data.rowOffsets[n]!==edgeCount)throw Error('Connessioni MaleCNS complete non valide');
      rowOffsets=data.rowOffsets;targets=data.targets;weights=data.weights;csrWeights=weights;
      for(let i=1;i<rowOffsets.length;i++)if(rowOffsets[i]<rowOffsets[i-1])throw Error('Indice sparso MaleCNS non valido');
      for(let i=0;i<edgeCount;i++)if(targets[i]>=n||!Number.isFinite(weights[i])||weights[i]<=0)throw Error('Connessione MaleCNS completa non valida');
    }else{
      if(!data.nodes?.length||!data.edges?.length||new Set(data.nodes.map(node=>node.bodyId)).size!==n)throw Error('Identificatori neuronali non validi');
      const incoming=new Float64Array(n),edges=data.edges;
      for(const [a,b,w] of edges){if(!Number.isInteger(a)||!Number.isInteger(b)||a<0||b<0||a>=n||b>=n||!Number.isFinite(w)||w<=0)throw Error('Connessione non valida');incoming[b]+=w;}
      from=new Uint32Array(edges.length);to=new Uint32Array(edges.length);weights=new Float64Array(edges.length);
      const counts=new Uint32Array(n);edges.forEach(([a,b,w],i)=>{from[i]=a;to[i]=b;weights[i]=w/incoming[b];counts[a]++;});
      rowOffsets=new Uint32Array(n+1);for(let i=0;i<n;i++)rowOffsets[i+1]=rowOffsets[i]+counts[i];
      targets=new Uint32Array(edges.length);csrWeights=new Float64Array(edges.length);const cursor=rowOffsets.slice(0,n);
      edges.forEach(([a,b,w])=>{const index=cursor[a]++;targets[index]=b;csrWeights[index]=w/incoming[b];});
    }
    const inputs=Uint32Array.from(data.inputIndices||[]),outputs=Uint32Array.from(data.outputIndices||[]);
    if(!inputs?.length||!outputs?.length) throw Error('Ingressi/uscite del grafo mancanti');
    if([...inputs,...outputs].some(i=>!Number.isInteger(i)||i<0||i>=n) || inputs.some(i=>outputs.includes(i))) throw Error('Mappatura sensori/neuroni non valida');
    const inputChannels=new Uint8Array(inputs.length),physicsChannels=new Int8Array(inputs.length),roadChannels=new Int8Array(inputs.length),physicsRelayStart=Math.max(0,inputs.length-PHYSICS_RELAY_COUNT);physicsChannels.fill(-1);roadChannels.fill(-1);
    inputs.forEach((index,k)=>{
      const side=compact?data.sideCodes[index]:data.nodes[index].side==='R'?1:data.nodes[index].side==='L'?-1:0;inputChannels[k]=side<0?k%4:side>0?3+k%4:k%VISUAL_SENSOR_COUNT;
      if(k>=physicsRelayStart) {
        const relayOffset=k-physicsRelayStart;
        physicsChannels[k]=VISUAL_SENSOR_COUNT+relayOffset%VEHICLE_PHYSICS_SENSOR_COUNT;
        roadChannels[k]=VISUAL_SENSOR_COUNT+VEHICLE_PHYSICS_SENSOR_COUNT+relayOffset%ROAD_PHYSICS_SENSOR_COUNT;
      }
    });
    const missingPosition=compact?data.missingPositionValue:-2147483648;
    let bodyIds,positions,classCodes,sideCodes,classNames,coordinateCount,outputMeta;
    if(compact){
      bodyIds=data.bodyIds;positions=data.positions;classCodes=data.classCodes;sideCodes=data.sideCodes;classNames=data.classNames;coordinateCount=data.coordinateCount;outputMeta=data.outputNodes;
    }else{
      bodyIds=new Float64Array(n);positions=new Int32Array(n*3);positions.fill(missingPosition);classNames=[...new Set(nodes.map(node=>node.superclass||'unknown'))].sort();const classIndex=new Map(classNames.map((name,index)=>[name,index]));classCodes=new Uint8Array(n);sideCodes=new Int8Array(n);coordinateCount=0;
      nodes.forEach((node,index)=>{bodyIds[index]=node.bodyId;classCodes[index]=classIndex.get(node.superclass||'unknown');sideCodes[index]=node.side==='R'?1:node.side==='L'?-1:0;if(Array.isArray(node.position)&&node.position.length===3){positions.set(node.position,index*3);coordinateCount++;}});
      outputMeta=Array.from(outputs,index=>({...nodes[index],index}));
    }
    const outputMask=new Uint8Array(n);outputs.forEach(index=>{outputMask[index]=1;});
    return {n,edgeCount:compact?data.edgeCount:data.edges.length,from,to,weights,rowOffsets,targets,csrWeights,inputs,outputs,nodes,bodyIds,positions,classCodes,sideCodes,classNames,coordinateCount,missingPosition,outputMeta,coreMask:compact?data.coreMask:null,outputMask,inputChannels,physicsChannels,roadChannels,visualInputCount:inputs.length,physicsRelayStart,physicsRelayCount:inputs.length-physicsRelayStart,roadRelayCount:inputs.length-physicsRelayStart,revision:data.modelRevision||1,dataset:data.dataset||'male-cns',modelId:data.modelId||`v${data.modelRevision||1}`,modelLabel:data.modelLabel||null,full:compact,solver:data.solver||null,policyConfig:data.policyConfig||null};
  }
  function makeGenome(random,outputCount) {
    const encoder=Array(SENSOR_COUNT*2).fill(0);for(let i=0;i<SENSOR_COUNT;i++){const expansion=i>=LEGACY_VISUAL_SENSOR_COUNT&&i<VISUAL_SENSOR_COUNT,roadRelay=i>=VISUAL_SENSOR_COUNT+VEHICLE_PHYSICS_SENSOR_COUNT;if(roadRelay){encoder[i]=0;encoder[SENSOR_COUNT+i]=0;continue;}const scale=expansion?.08:i<VISUAL_SENSOR_COUNT?.6:.15;encoder[i]=normal(random)*scale;encoder[SENSOR_COUNT+i]=normal(random)*scale;}
    return {encoder,
      readout:Array.from({length:outputCount*3},(_,i)=>normal(random)*(i%3===0?3:1.5)+(i%3===1?1.5:0)),
      gain:1+random()*2};
  }
  function ensureLearning(graph){if(!Learning)throw Error('Modulo di apprendimento neurale mancante.');return graph.learning||Learning.build(graph);}
  function fastNeuralStep(graph,brain,genome,sensors,enabled=true,edgesEnabled=true){ensureLearning(graph);return Learning.commands(graph,brain,genome,enabled,edgesEnabled);}
  function makeLearningGenome(graph,random){const genome=makeGenome(random,graph.outputs.length);genome.adapterVersion=ensureLearning(graph).version;genome.policyWeights=Learning.initial(graph,random);return genome;}
  function cloneGenome(g) {return {encoder:[...g.encoder],readout:[...g.readout],gain:g.gain,...(g.policyWeights?{adapterVersion:g.adapterVersion,policyWeights:[...g.policyWeights]}:{})};}
  function crossoverGenome(a,b,random) {
    const pick=(left,right)=>random()<.5?left:right;
    const child={
      encoder:a.encoder.map((value,index)=>pick(value,b.encoder[index]??value)),
      readout:a.readout.map((value,index)=>pick(value,b.readout[index]??value)),
      gain:pick(a.gain,b.gain)
    };
    if(a.policyWeights){child.adapterVersion=a.adapterVersion;child.policyWeights=a.policyWeights.map((v,i)=>pick(v,b.policyWeights?.[i]??v));}
    return child;
  }
  function normalizeGenome(g,outputCount) {
    const encoder=Array(SENSOR_COUNT*2).fill(0);
    const source=Array.isArray(g?.encoder)?g.encoder:[],sourceCount=source.length===LEGACY_ENCODER_LENGTH?LEGACY_VISUAL_SENSOR_COUNT:source.length===PREVIOUS_ENCODER_LENGTH?PREVIOUS_SENSOR_COUNT:Math.min(SENSOR_COUNT,Math.floor(source.length/2));
    for(let i=0;i<sourceCount;i++) {
      encoder[i]=Number.isFinite(source[i])?source[i]:0;
      encoder[SENSOR_COUNT+i]=Number.isFinite(source[sourceCount+i])?source[sourceCount+i]:0;
    }
    const readout=Array.from({length:outputCount*3},(_,i)=>Number.isFinite(g?.readout?.[i])?g.readout[i]:0);
    if(g?.fastMotor)throw Error('Controller assistito 4.3 rimosso: premere Reset per apprendere con la rete MaleCNS.');
    if((g?.policyWeights!==undefined||g?.adapterVersion!==undefined)&&(!Learning.supportedVersion(g.adapterVersion)||!Array.isArray(g.policyWeights)||!g.policyWeights.every(v=>Number.isFinite(v)&&Math.abs(v)<=8)))throw Error('Policy MaleCNS incompatibile: usare Reset.');
    return {encoder,readout,gain:Number.isFinite(g?.gain)&&g.gain>0?g.gain:1,...(Learning.supportedVersion(g?.adapterVersion)&&Array.isArray(g.policyWeights)&&g.policyWeights.every(v=>Number.isFinite(v)&&Math.abs(v)<=8)?{adapterVersion:g.adapterVersion,policyWeights:[...g.policyWeights]}:{})};
  }
  function mutateGenome(g,random,amount) {
    const child=cloneGenome(g),intensity=clamp(Number(amount)||0,0,EVOLUTION_RULES.mutationCeiling); if(intensity===0) return child;
    // Compatibility helper; ordinary RL offspring use the optimizer's learned
    // mean and diagonal exploration scales, not a calibrated driving policy.
    if(child.policyWeights){child.policyWeights=child.policyWeights.map(v=>clamp(v+normal(random)*intensity*.2,-8,8));return child;}
    const mutateArray=(values,scale,channelAware=false)=>values.map((value,index)=>{
      const roll=random();
      const channel=channelAware?(index<SENSOR_COUNT?index:index-SENSOR_COUNT):-1,channelScale=channel>=LEGACY_VISUAL_SENSOR_COUNT&&channel<VISUAL_SENSOR_COUNT?.45:1;
      if(roll<.035)return clamp(normal(random)*intensity*scale*channelScale*2.5,-12,12);
      return roll<.78?clamp(value+normal(random)*intensity*scale*channelScale,-12,12):value;
    });
    child.encoder=mutateArray(child.encoder,2,true);
    child.readout=mutateArray(child.readout,5);
    // Occasionally mutate a complete sensor channel together. This lets the
    // population discover a useful sensor bias/gain pair faster than two
    // independent point mutations while preserving ordinary small changes.
    if(random()<.15){
      const channel=Math.floor(random()*SENSOR_COUNT);
      child.encoder[channel]=clamp(child.encoder[channel]+normal(random)*intensity*3,-12,12);
      child.encoder[SENSOR_COUNT+channel]=clamp(child.encoder[SENSOR_COUNT+channel]+normal(random)*intensity*2,-12,12);
    }
    child.gain=clamp(child.gain+normal(random)*intensity,0.1,6); return child;
  }
  function makeBrain(graph) {
    if(!graph.full)return {activity:new Float64Array(graph.n),next:new Float64Array(graph.n),sum:new Float64Array(graph.n),injection:new Float64Array(graph.n)};
    return {activity:new Float32Array(graph.n),next:new Float32Array(graph.n),sum:new Float32Array(graph.n),inputDrive:new Float32Array(graph.inputs.length),active:new Uint32Array(graph.n),nextActive:new Uint32Array(graph.n),touched:new Uint32Array(graph.n),marked:new Uint8Array(graph.n),buckets:new Uint32Array(256),activeCount:0,lastTouchedCount:0,peakActiveCount:0};
  }
  function sensorDrive(graph,genome,sensors,k,physicsGain){
    if(genome.policyWeights){if(genome.adapterVersion!==ensureLearning(graph).version)throw Error('Versione della policy neurale incompatibile.');return Learning.drive(graph,genome,sensors,k);}
    const channel=graph.inputChannels?graph.inputChannels[k]:k%VISUAL_SENSOR_COUNT,value=Number.isFinite(sensors?.[channel])?sensors[channel]:0,weight=Number.isFinite(genome.encoder?.[channel])?genome.encoder[channel]:0,bias=Number.isFinite(genome.encoder?.[SENSOR_COUNT+channel])?genome.encoder[SENSOR_COUNT+channel]:0;
    let contribution=value*weight+bias;const physicsChannel=graph.physicsChannels?.[k]??-1,roadChannel=graph.roadChannels?.[k]??-1;
    if(physicsChannel>=VISUAL_SENSOR_COUNT){const physicsValue=Number.isFinite(sensors?.[physicsChannel])?sensors[physicsChannel]:0,physicsWeight=Number.isFinite(genome.encoder?.[physicsChannel])?genome.encoder[physicsChannel]:0,physicsBias=Number.isFinite(genome.encoder?.[SENSOR_COUNT+physicsChannel])?genome.encoder[SENSOR_COUNT+physicsChannel]:0;contribution+=physicsGain*(physicsValue*physicsWeight+physicsBias);}
    if(roadChannel>=VISUAL_SENSOR_COUNT+VEHICLE_PHYSICS_SENSOR_COUNT){const roadValue=Number.isFinite(sensors?.[roadChannel])?sensors[roadChannel]:0,roadWeight=Number.isFinite(genome.encoder?.[roadChannel])?genome.encoder[roadChannel]:0,roadBias=Number.isFinite(genome.encoder?.[SENSOR_COUNT+roadChannel])?genome.encoder[SENSOR_COUNT+roadChannel]:0;contribution+=physicsGain*(roadValue*roadWeight+roadBias);}
    return genome.gain*contribution;
  }
  function applyNeuralState(graph,brain,activeIndices,activeValues){
    if(!graph.full){
      brain.activity.fill(0);
      const count=Math.min(graph.n,activeIndices?.length||0,activeValues?.length||0);
      for(let i=0;i<count;i++){
        const index=Number(activeIndices[i]);
        if(index>=0&&index<graph.n)brain.activity[index]=Number(activeValues[i])||0;
      }
      return count;
    }
    const previousCount=Math.min(brain.activeCount,brain.active.length);
    for(let i=0;i<previousCount;i++){
      const index=brain.active[i];
      if(index<graph.n)brain.activity[index]=0;
    }
    const budget=Math.min(graph.n,graph.solver?.activeNeuronBudget??brain.active.length,brain.active.length);
    const count=Math.min(budget,Number(activeIndices?.length)||0,Number(activeValues?.length)||0);
    let written=0;
    for(let i=0;i<count;i++){
      const index=Number(activeIndices[i]);
      if(!Number.isInteger(index)||index<0||index>=graph.n)continue;
      brain.active[written]=index;
      brain.activity[index]=Number(activeValues[i])||0;
      written++;
    }
    brain.activeCount=written;
    brain.lastTouchedCount=written;
    brain.lastCoreCandidateCount=0;
    brain.peakActiveCount=Math.max(brain.peakActiveCount,written);
    return written;
  }
  function neuralOutputsFromBrain(graph,brain,genome,launchBias=NEURAL_MOTOR_LAUNCH_BIAS){
    if(genome.policyWeights){if(genome.adapterVersion!==ensureLearning(graph).version)throw Error('Versione della policy neurale incompatibile.');return Learning.commands(graph,brain,genome);}
    const raw=[0,0,0];
    graph.outputs.forEach((index,k)=>{for(let o=0;o<3;o++)raw[o]+=brain.activity[index]*genome.readout[k*3+o];});
    // The throttle/brake channels are opposing motor logits. Scaling their
    // difference makes small but meaningful genetic differences visible to
    // the physics, while the final split guarantees mutual exclusion.
    const neuralSignal=Math.max(Math.abs(raw[0]),Math.abs(raw[1]),Math.abs(raw[2]));
    const activeLaunchBias=neuralSignal>1e-9?launchBias:0;
    const longitudinal=clamp((raw[1]-raw[2])*NEURAL_MOTOR_GAIN+activeLaunchBias,-1,1);
    return [Math.tanh(raw[0]),Math.max(0,longitudinal),Math.max(0,-longitudinal)];
  }
  function neuralStateStep(graph,brain,genome,activeIndices,activeValues,launchBias=NEURAL_MOTOR_LAUNCH_BIAS){
    applyNeuralState(graph,brain,activeIndices,activeValues);
    return neuralOutputsFromBrain(graph,brain,genome,launchBias);
  }
  function sparseIteration(graph,brain,edgesEnabled,gains=null){
    const activity=brain.activity,next=brain.next,sum=brain.sum,marked=brain.marked,touched=brain.touched,nextActive=brain.nextActive;
    const activityThreshold=graph.solver?.activityThreshold??0.0005,edgeThreshold=graph.solver?.edgeContributionThreshold??0.0000005,budget=Math.min(graph.n,graph.solver?.activeNeuronBudget??16384);
    let touchedCount=0;
    graph.inputs.forEach((index,k)=>{const drive=brain.inputDrive[k];if(Math.abs(drive)<edgeThreshold)return;if(!marked[index]){marked[index]=1;touched[touchedCount++]=index;}sum[index]+=drive;});
    for(let k=0;k<brain.activeCount;k++){
      const source=brain.active[k],sourceActivity=activity[source];
      if(!marked[source]){marked[source]=1;touched[touchedCount++]=source;}
      if(!edgesEnabled||Math.abs(sourceActivity)<activityThreshold)continue;
      for(let edge=graph.rowOffsets[source],end=graph.rowOffsets[source+1];edge<end;edge++){
        const contribution=.9*graph.csrWeights[edge]*sourceActivity*(gains?gains[graph.learning.groups[source]]:1);if(Math.abs(contribution)<edgeThreshold)continue;
        const target=graph.targets[edge];if(!marked[target]){marked[target]=1;touched[touchedCount++]=target;}sum[target]+=contribution;
      }
    }
    let candidateCount=0;
    for(let k=0;k<touchedCount;k++){
      const index=touched[k],value=.45*activity[index]+.55*Math.tanh(sum[index]);sum[index]=0;marked[index]=0;
      if(Math.abs(value)>=activityThreshold){next[index]=value;nextActive[candidateCount++]=index;}else next[index]=0;
    }
    const selected=brain.active;
    let selectedCount=0,coreCandidateCount=0;
    if(candidateCount<=budget){selected.set(nextActive.subarray(0,candidateCount));selectedCount=candidateCount;for(let k=0;k<candidateCount;k++)coreCandidateCount+=graph.coreMask[nextActive[k]];}
    else{
      const buckets=brain.buckets,selectedMark=marked;
      // The audited 7,721-neuron driving core has priority, so the complete
      // graph can add context without evicting the known sensor-to-DN routes.
      for(let k=0;k<candidateCount&&selectedCount<budget;k++){const index=nextActive[k];if(graph.outputMask[index]){selected[selectedCount++]=index;selectedMark[index]=1;}}
      const appendGroup=wantCore=>{
        const capacity=budget-selectedCount;if(capacity<=0)return;
        buckets.fill(0);let total=0;
        for(let k=0;k<candidateCount;k++){const index=nextActive[k];if(selectedMark[index]||Boolean(graph.coreMask[index])!==wantCore)continue;buckets[Math.min(255,Math.floor(Math.abs(next[index])*255))]++;total++;}
        if(!total)return;
        let cutoff=0,atCutoff=capacity;
        if(total>capacity){let above=0;cutoff=255;while(cutoff>0&&above+buckets[cutoff]<=capacity){above+=buckets[cutoff];cutoff--;}atCutoff=capacity-above;}
        for(let k=0;k<candidateCount&&selectedCount<budget;k++){
          const index=nextActive[k];if(selectedMark[index]||Boolean(graph.coreMask[index])!==wantCore)continue;
          const bucket=Math.min(255,Math.floor(Math.abs(next[index])*255));if(total<=capacity||bucket>cutoff||(bucket===cutoff&&atCutoff-->0)){selected[selectedCount++]=index;selectedMark[index]=1;}
        }
      };
      for(let k=0;k<candidateCount;k++)coreCandidateCount+=graph.coreMask[nextActive[k]];
      appendGroup(true);appendGroup(false);
      for(let k=0;k<candidateCount;k++){const index=nextActive[k];if(!selectedMark[index])next[index]=0;else selectedMark[index]=0;}
    }
    brain.activity=next;brain.next=activity;
    brain.lastTouchedCount=touchedCount;brain.lastCoreCandidateCount=coreCandidateCount;brain.activeCount=selectedCount;brain.peakActiveCount=Math.max(brain.peakActiveCount,selectedCount);
  }
  function neuralStep(graph,brain,genome,sensors,enabled=true,edgesEnabled=true,physicsGain=PHYSICS_ADAPTER_GAIN,launchBias=NEURAL_MOTOR_LAUNCH_BIAS) {
    if(!enabled) {brain.activity.fill(0);brain.next.fill(0);if(graph.full){brain.sum.fill(0);brain.marked.fill(0);brain.activeCount=0;}return [0,0,0];}
    // An explicitly artificial, unsigned rate reservoir, not a validated biophysical model.
    // True directed synaptic counts are normalized per postsynaptic neuron.
    // V2 is intentionally lighter; V3 keeps the previously verified recurrent
    // depth so the extra adapter sensors do not reduce controller fidelity.
    // V4 reads its sparse pass count from the verified bundle metadata.
    const gains=genome.policyWeights?Learning.synapticGains(graph,genome):null;
    if(graph.full){
      graph.inputs.forEach((index,k)=>{brain.inputDrive[k]=sensorDrive(graph,genome,sensors,k,physicsGain);});
      for(let iter=0;iter<(graph.solver?.iterationsPerControlTick??4);iter++)sparseIteration(graph,brain,edgesEnabled,gains);
    }else{
      const injection=brain.injection;injection.fill(0);graph.inputs.forEach((index,k)=>{injection[index]=sensorDrive(graph,genome,sensors,k,physicsGain);});
      const iterations=graph.modelId==='v2'?V2_ITERATIONS_PER_CONTROL_TICK:V3_ITERATIONS_PER_CONTROL_TICK;
      for(let iter=0;iter<iterations;iter++){brain.sum.set(injection);if(edgesEnabled)for(let e=0;e<graph.from.length;e++){const source=graph.from[e];brain.sum[graph.to[e]]+=.9*graph.weights[e]*brain.activity[source]*(gains?gains[graph.learning.groups[source]]:1);}for(let i=0;i<graph.n;i++)brain.next[i]=.45*brain.activity[i]+.55*Math.tanh(brain.sum[i]);[brain.activity,brain.next]=[brain.next,brain.activity];}
    }
    return !edgesEnabled&&genome.policyWeights?[0,0,0]:neuralOutputsFromBrain(graph,brain,genome,launchBias);
  }
  class Simulation {
    constructor(data,options={}) {
      this.graph=compileGraph(data);this.modelId=options.modelId||data.modelId||this.graph.modelId;this.modelLabel=options.modelLabel||data.modelLabel||this.graph.modelLabel;this.seed=options.seed??7717;
      this.learningEnabled=options.learningEnabled!==false;if(this.learningEnabled)ensureLearning(this.graph);
      this.brainFactory=typeof options.brainFactory==='function'?options.brainFactory:makeBrain;
      this.circuits=[{id:'lab',name:'Laboratorio',revision:1,description:'Circuito originale per confrontare i controller.',landmarks:[]},...(options.circuits?.circuits||[])];
      this.configureCircuit(options.circuitId||'lab');
      // Headless diagnostics may intentionally use one or two agents; the
      // desktop engine/UI enforce the practical minimum of four separately.
      this.population=clamp(Math.round(options.population??18),1,MAX_POPULATION);this.mutation=clamp(Number(options.mutation??0.12),0,EVOLUTION_RULES.mutationCeiling);this.speedMultiplier=clamp(options.speedMultiplier??1,.5,30);
      this.mode='connectome';this.running=true;this.generation=1;this.elapsed=0;this.accumulator=0;
      this.history=[];this.bestEver=-Infinity;this.champion=null;this.championStats=null;this.externalChampion=null;this.hallOfFame=[];this.stagnation=0;this.ticks=0;
      this.random=rng(this.seed);this.reset();
    }
    configureCircuit(id) {
      const definition=this.circuits.find(c=>c.id===id);
      if(!definition)throw Error('Circuito sconosciuto: '+id);
      const track=definition.points?makeTrack(definition.points,definition.halfWidth,true,definition.boundaries,definition):makeTrack();
      Vehicle.configureTrack(track,id);
      this.circuitId=id;this.circuit=definition;this.track=track;
    }
    setCircuit(id) {this.configureCircuit(id);this.reset();}
    spawn(genomes,rebaseOptimizer=false) {
      if(!Array.isArray(genomes)||genomes.length<1||genomes.length>MAX_POPULATION)throw Error('Popolazione MaleCNS non valida.');
      const normalized=genomes.map(g=>normalizeGenome(g,this.graph.outputs.length));
      for(const g of normalized)if(g.policyWeights&&(g.adapterVersion!==ensureLearning(this.graph).version||!Learning.valid(this.graph,g.policyWeights)))throw Error('Dimensioni o versione della policy MaleCNS incompatibili: usare Reset.');
      if(rebaseOptimizer&&this.optimizer&&genomes[0]?.policyWeights)this.optimizer.adopt(genomes[0].policyWeights);
      this.cars=normalized.map((g,i)=>{const car=makeCar(this.track,i,g);car.brain=this.brainFactory(this.graph);car.inputs=sense(this.track,car);car.physicsInputs=physicsSense(car,this.track);car.sensorVector=car.inputs.concat(car.physicsInputs);return car;});
      for(const car of this.cars)car.previousGenerationLapTime=this.history.at(-1)?.bestLapTime??null;
      // Actions are decoded from the recurrent graph, never from sensors or
      // a separate wall-following controller. Physics remains at 60 Hz.
      this.neuralInterval=this.cars.every(car=>car.genome.policyWeights)?Learning.CONTROL_INTERVAL:3;
      this.elapsed=0; this.ticks=0;
    }
    reset() {
      this.random=rng(this.seed);this.generation=1;this.history=[];this.bestEver=-Infinity;this.champion=null;this.championStats=null;this.externalChampion=null;this.hallOfFame=[];this.stagnation=0;this.accumulator=0;
      this.learningFrontier={progress:0,laps:0,lapTime:null};
      this.optimizer=this.learningEnabled?new Learning.EvolutionStrategy(this.graph):null;
      this.spawn(Array.from({length:this.population},()=>this.learningEnabled?makeLearningGenome(this.graph,this.random):makeGenome(this.random,this.graph.outputs.length)));
    }
    adoptChampion(genome) {
      if(!genome) return;
      const candidate=normalizeGenome(genome,this.graph.outputs.length);
      if(candidate.policyWeights&&(candidate.adapterVersion!==ensureLearning(this.graph).version||!Learning.valid(this.graph,candidate.policyWeights)))throw Error('Campione di un modello neurale incompatibile.');
      this.externalChampion=candidate;
    }
    evolve() {
      const previous=this.history.length?this.history.at(-1):null;
      const previousBestLapTime=previous?.bestLapTime??null;
      for(const car of this.cars){car.previousGenerationLapTime=previousBestLapTime;Rewards.finish(this.track,car);}
      const eligible=this.cars.filter(c=>!c.diagnosticVehicle);
      // Human gearbox/assist interventions cannot become training examples or
      // champions. If every episode was edited, restart without an update.
      if(!eligible.length){this.generation++;this.spawn(Array.from({length:this.population},()=>this.learningEnabled?makeLearningGenome(this.graph,this.random):makeGenome(this.random,this.graph.outputs.length)));return;}
      const ranked=eligible.slice().sort(compareAgents),winner=ranked[0],progressLeader=eligible.slice().sort((a,b)=>b.bestProgress-a.bestProgress||compareAgents(a,b))[0],fastestLapTime=ranked.reduce((bestLap,car)=>Math.min(bestLap,car.bestLapTime),Infinity),noLapCount=ranked.filter(car=>car.laps<1).length,slowerLapCount=ranked.filter(car=>car.lapRegressionPenalty>0).length;
      if(this.mutation>0)this.optimizer?.update(ranked);
      const records=eligible.map(car=>({car,...Rewards.recordStats(car)})).sort(compareAgents),recordWinner=records[0];
      const improved=!this.championStats||compareAgents(recordWinner,this.championStats)<0;
      // Improving points by dying earlier is not progress. Track the physical
      // frontier separately and preserve it in shareable training files.
      const frontier=this.learningFrontier,maxLaps=Math.max(...eligible.map(c=>c.laps));
      const drivingImproved=progressLeader.bestProgress>frontier.progress+Math.max(this.track.pixelsPerMeter||1,this.track.total*.0005)||maxLaps>frontier.laps||
        (Number.isFinite(fastestLapTime)&&(frontier.lapTime===null||fastestLapTime<frontier.lapTime*.999));
      if(drivingImproved)this.learningFrontier={progress:Math.max(frontier.progress,progressLeader.bestProgress),laps:Math.max(frontier.laps,maxLaps),lapTime:Number.isFinite(fastestLapTime)?Math.min(frontier.lapTime??Infinity,fastestLapTime):frontier.lapTime};
      this.stagnation=drivingImproved?0:this.stagnation+1;
      if(this.mutation>0)this.optimizer?.explore(this.stagnation);
      if(improved) {this.bestEver=recordWinner.fitness;this.champion=cloneGenome(recordWinner.car.genome);this.championStats=Rewards.recordStats(recordWinner.car);}
      const baseMutation=clamp(Number(this.mutation)||0,0,EVOLUTION_RULES.mutationCeiling);
      const mutationSchedule=this.stagnation>=EVOLUTION_RULES.stagnationWindow?EVOLUTION_RULES.stagnationMutationMultiplier:1;
      const mutationAmount=baseMutation===0?0:clamp(baseMutation*mutationSchedule,EVOLUTION_RULES.mutationFloor,EVOLUTION_RULES.mutationCeiling);
      const diversify=baseMutation>0&&this.stagnation>=1;
      const archiveEntries=records.slice(0,EVOLUTION_RULES.hallOfFameCount).map(({car})=>({
        genome:cloneGenome(car.genome),...Rewards.recordStats(car),progress:car.bestProgress
      }));
      const uniqueArchive=new Map();for(const candidate of [...this.hallOfFame,...archiveEntries].sort(compareAgents)){const key=JSON.stringify(candidate.genome);if(!uniqueArchive.has(key))uniqueArchive.set(key,candidate);}
      this.hallOfFame=[...uniqueArchive.values()].slice(0,EVOLUTION_RULES.hallOfFameCount);

      const immigrantCount=baseMutation>0?Math.max(1,Math.floor(this.population*(this.stagnation>=EVOLUTION_RULES.stagnationWindow?EVOLUTION_RULES.immigrantRate:.08))):0;
      this.history.push({generation:this.generation,best:winner.fitness,mean:ranked.reduce((s,c)=>s+c.fitness,0)/ranked.length,reward:winner.reward,penalty:winner.penalty,laps:winner.laps,maxLaps,bestProgress:progressLeader.bestProgress,meanProgress:ranked.reduce((s,c)=>s+c.bestProgress,0)/ranked.length,bestLapTime:Number.isFinite(fastestLapTime)?fastestLapTime:null,noLapCount,slowerLapCount,stagnation:this.stagnation,mutationAmount,immigrantCount,hallOfFame:this.hallOfFame.length,learning:this.optimizer?.metrics()||null,rewardRevision:Rewards.REVISION,baseBest:records[0].fitness,previousBestLapTime,rewardBreakdown:JSON.parse(JSON.stringify(winner.rewardBreakdown))});
      if(this.history.length>100) this.history.shift();

      const genomes=[cloneGenome(winner.genome)];
      // Keep the champion imported from another desktop worker in a stable
      // slot. This is intentionally second so existing champion-import saves
      // remain deterministic and visible in the next population.
      if(this.externalChampion&&genomes.length<this.population&&JSON.stringify(this.externalChampion)!==JSON.stringify(winner.genome)) genomes.push(cloneGenome(this.externalChampion));
      // Reevaluate the historical best under current physics, never reuse its
      // stored score. It cannot disappear just because one generation regressed.
      if(baseMutation>0&&this.champion&&genomes.length<Math.min(3,this.population-2)&&!genomes.some(g=>JSON.stringify(g)===JSON.stringify(this.champion)))genomes.push(cloneGenome(this.champion));
      const eliteCandidates=ranked;
      const eliteGenomes=new Set(genomes.map(g=>JSON.stringify(g)));
      // Small batches need new evaluated policies, not four copied elites.
      const eliteBudget=this.population<16?Math.max(1,Math.floor(this.population/8)):EVOLUTION_RULES.eliteCount;
      const eliteLimit=baseMutation>0?Math.min(eliteBudget,Math.max(1,this.population-2)):this.population;
      for(const candidate of eliteCandidates) {
        const genome=candidate.genome;
        const key=JSON.stringify(genome);if(genomes.length<eliteLimit&&genome&&!eliteGenomes.has(key)) {genomes.push(cloneGenome(genome));eliteGenomes.add(key);}
      }
      this.externalChampion=null;

      const parentFraction=diversify?EVOLUTION_RULES.parentPoolFraction:.35;
      const parentCount=Math.max(2,Math.min(ranked.length,Math.ceil(ranked.length*parentFraction)));
      const parents=ranked.slice(0,parentCount);
      const parentPool=parents;
      const chooseParent=()=>parentPool[Math.min(parentPool.length-1,Math.floor(Math.pow(this.random(),1.6)*parentPool.length))];
      const childMutationAmount=()=>{
        if(baseMutation===0)return 0;
        const roll=this.random();let multiplier=1;
        if(this.stagnation>=2&&roll<EVOLUTION_RULES.hyperMutationRate) multiplier=2.25;
        else if(roll<EVOLUTION_RULES.calmMutationRate) multiplier=.55;
        else if(this.stagnation>=1&&roll<EVOLUTION_RULES.calmMutationRate+EVOLUTION_RULES.explorerRate) multiplier=1.35;
        return clamp(mutationAmount*multiplier,EVOLUTION_RULES.mutationFloor,EVOLUTION_RULES.mutationCeiling);
      };
      let mirrored=null;
      while(genomes.length<this.population) {
        if(immigrantCount>0&&genomes.length>=this.population-immigrantCount) {
          genomes.push(this.learningEnabled?makeLearningGenome(this.graph,this.random):makeGenome(this.random,this.graph.outputs.length));
          continue;
        }
        if(this.optimizer&&winner.genome.policyWeights){
          const child=cloneGenome(winner.genome);
          if(baseMutation===0)child.policyWeights=winner.genome.policyWeights.slice();
          else if((genomes.length%8)===0)child.policyWeights=Learning.localMutation(this.graph,chooseParent().genome.policyWeights,this.random,mutationAmount*.65);
          else {child.policyWeights=this.optimizer.sample(this.random,mutationAmount,this.stagnation,mirrored);mirrored=mirrored?null:child.policyWeights;}
          genomes.push(child);continue;
        }
        const first=chooseParent();
        let child=cloneGenome(first.genome);
        if(baseMutation>0&&parentPool.length>1&&this.random()<EVOLUTION_RULES.crossoverRate) child=crossoverGenome(first.genome,chooseParent().genome,this.random);
        genomes.push(mutateGenome(child,this.random,childMutationAmount()));
      }
      this.generation++;this.spawn(genomes);
    }
    tick(neuralOverrides=null,sensorsReady=false) {
      this.elapsed+=DT;
      for(const car of this.cars) {
        if(!car.alive) continue;
        // The desktop GPU bridge already sampled this exact physical state
        // to prepare the neural batch. Reuse it instead of raycasting twice.
        if(this.ticks%this.neuralInterval===0&&!(sensorsReady&&neuralOverrides)) {
          car.inputs=sense(this.track,car);
          car.physicsInputs=physicsSense(car,this.track);car.sensorVector=car.inputs.concat(car.physicsInputs);
        }
        if(this.ticks%this.neuralInterval===0) {
          const override=neuralOverrides?.get?.(car.id) || neuralOverrides?.[car.id];
          const mapCircuit=this.track.halfWidth<20;
          car.slowOutputs=override?neuralStateStep(this.graph,car.brain,car.genome,override.active,override.values,mapCircuit?MAP_NEURAL_MOTOR_LAUNCH_BIAS:NEURAL_MOTOR_LAUNCH_BIAS):neuralStep(this.graph,car.brain,car.genome,car.sensorVector,this.mode!=='off',true,mapCircuit?MAP_PHYSICS_ADAPTER_GAIN:PHYSICS_ADAPTER_GAIN,mapCircuit?MAP_NEURAL_MOTOR_LAUNCH_BIAS:NEURAL_MOTOR_LAUNCH_BIAS);
        }
        car.outputs=this.mode==='straight'?[0,.7,0]:this.mode==='off'?[0,0,0]:car.slowOutputs;
        drive(this.track,car,car.outputs,DT);
        if(this.ticks%6===0) {car.trail.push([car.x,car.y]);if(car.trail.length>160) car.trail.shift();}
      }
      this.ticks++;
      // Optional read-only test telemetry, before an automatic evolution can
      // replace the final cars. Absent in ordinary training.
      this.onTrialTick?.(this);
      if(this.cars.every(c=>!c.alive)) {
        if(this.mode==='connectome') this.evolve(); else this.running=false;
      }
    }
    advance(seconds) {
      if(!this.running) return;
      this.accumulator+=Math.max(0,seconds)*this.speedMultiplier;
      while(this.accumulator>=DT-1e-10 && this.running) {this.tick();this.accumulator-=DT;}
    }
  }
  const LEGACY_GRAPH={revision:1,nodes:364,edges:6441};
  const EXPANDED_GRAPH={revision:3,nodes:7721,edges:242486};
  function checkpointKey(id='lab',revision=1) {return `malecns-circuit-v48-${Rewards.REVISION}-${Vehicle.REVISION}-${id}-r${revision}-champion`;}
  function graphCompatible(saved,sim,dataset) {
    if(saved?.dataset!==dataset)return false;
    if(saved.graphRevision===sim.graph.revision)return saved.nodes===sim.graph.n&&saved.edges===sim.graph.edgeCount;
    if(saved.graphRevision===EXPANDED_GRAPH.revision)return saved.nodes===EXPANDED_GRAPH.nodes&&saved.edges===EXPANDED_GRAPH.edges;
    // Keep the old graph compatibility allow-list exact; old adapter checkpoints
    // are accepted and normalized with zeroed physics channels at spawn.
    return !saved.graphRevision&&saved.nodes===LEGACY_GRAPH.nodes&&saved.edges===LEGACY_GRAPH.edges;
  }
  function validCheckpoint(saved,sim,dataset) {
    const g=saved?.genome;
    return !!(saved && saved.schema===1 && saved.rewardRevision===Rewards.REVISION && saved.vehicleRevision===Vehicle.REVISION && graphCompatible(saved,sim,dataset) &&
      (saved.circuitId||'lab')===sim.circuitId && (saved.circuitRevision||1)===(sim.circuit.revision||1) &&
      Number.isFinite(saved.fitness) && (g?.encoder?.length===LEGACY_ENCODER_LENGTH||g?.encoder?.length===PREVIOUS_ENCODER_LENGTH||g?.encoder?.length===SENSOR_COUNT*2) && g?.readout?.length===sim.graph.outputs.length*3 &&
      [...g.encoder,...g.readout,g.gain].every(Number.isFinite) && g.gain>0&&!g.fastMotor&&(sim.graph.modelId!=='v5'||g.policyWeights)&&(!g.policyWeights||(saved.graphRevision===sim.graph.revision&&saved.nodes===sim.graph.n&&saved.edges===sim.graph.edgeCount&&g.adapterVersion===ensureLearning(sim.graph).version&&Learning.valid(sim.graph,g.policyWeights))));
  }
  function compareAgents(a,b){
    const aFitness=Number.isFinite(a?.fitness)?a.fitness:-Infinity,bFitness=Number.isFinite(b?.fitness)?b.fitness:-Infinity;
    if(aFitness!==bFitness)return aFitness>bFitness?-1:1;
    const aLaps=Number(a?.laps)||0,bLaps=Number(b?.laps)||0;
    if(aLaps!==bLaps)return bLaps-aLaps;
    if(aLaps>0){const aTime=Number.isFinite(a.bestLapTime)?a.bestLapTime:Infinity,bTime=Number.isFinite(b.bestLapTime)?b.bestLapTime:Infinity;if(aTime!==bTime)return aTime-bTime;}
    const difference=(Number(b?.bestProgress??b?.progress)||0)-(Number(a?.bestProgress??a?.progress)||0);
    return Math.abs(difference)>1e-9?difference:0;
  }
  const api={Rewards,Vehicle,Simulation,makeTrack,makeCar,drive,locate,trackWidthAt,onRoad,sense,sensorDistances,physicsSense,roadSense,raycast,collided,compileGraph,makeBrain,sensorDrive,synapticGains:Learning.synapticGains,applyNeuralState,neuralOutputsFromBrain,normalizeDriveCommands,neuralStateStep,neuralStep,fastNeuralStep,ensureLearning,compareAgents,makeGenome,crossoverGenome,mutateGenome,cloneGenome,normalizeGenome,rng,checkpointKey,validCheckpoint,DT,SENSOR_MAX,MAX_SPEED,MAX_POPULATION,ANGLES,VISUAL_SENSOR_COUNT,VEHICLE_PHYSICS_SENSOR_COUNT,ROAD_PHYSICS_SENSOR_COUNT,PHYSICS_SENSOR_COUNT,SENSOR_COUNT,PHYSICS_RELAY_COUNT,ROAD_RELAY_COUNT,PHYSICS_ADAPTER_GAIN,MAP_PHYSICS_ADAPTER_GAIN,NEURAL_MOTOR_GAIN,NEURAL_MOTOR_LAUNCH_BIAS,SCORE_RULES,EVOLUTION_RULES,PHYSICS,clamp};
  if(typeof module!=='undefined'&&module.exports) module.exports=api; else root.FlySim=api;
})(typeof globalThis!=='undefined'?globalThis:this);
