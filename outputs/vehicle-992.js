/* Porsche 911 GT3 R (992), reduced ground-contact motorsport model.
 * SI dynamics, four independent rotating tyres, combined-slip forces.
 * No route, sensor, scoring, other-car or renderer dependency.
 * Published dimensions are not a proprietary Porsche/Michelin physics dataset.
 */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.MaleCNSVehicle=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),G=9.80665,RPM=60/(2*Math.PI);
  const Terrain=typeof module==='object'&&module.exports?require('./terrain.js'):globalThis.MaleCNSTerrain;
  const REVISION='992-gt3r-si-2',SOURCE='https://newsroom.porsche.com/dam/jcr%3A3b5e8287-01fb-481f-9d5c-2add88364f30/250808e_Technical%20Data%20911%20GT3%20R26.pdf';
  const SPEC=Object.freeze({id:'porsche-911-gt3-r-992',name:'Porsche 911 GT3 R (992)',modelYear:2026,source:SOURCE,
    baseMassKg:1265,lengthM:4.619,widthM:2.05,wheelbaseM:2.507,displacementCc:4194,
    maxPowerW:416000,maxRpm:9250,gears:6,drive:'RWD',tankLitres:117,
    frontTyre:'30/68-18',rearTyre:'31/71-18',frontRadiusM:.34,rearRadiusM:.355,
    frontDiscMm:390,rearDiscMm:370,
    notice:'Dati dimensionali Porsche 2026; potenza e massa dipendono dal BoP. Rapporti, coppia, aero, gomme e tarature sono stime del simulatore, non dati di omologazione WEC.'});
  // Every parameter below is a MODEL CHOICE, not a claimed manufacturer value.
  const MODEL=Object.freeze({driverKg:75,fuelDensity:.745,startFuelL:30,frontWeight:.40,cgHeightM:.32,
    frontTrackM:1.68,rearTrackM:1.66,yawInertia:1700,airDensity:1.225,dragArea:1.05,downforceArea:3.2,aeroFront:.43,
    rollingCoefficient:.012,gearRatios:Object.freeze([0,2.77,2.10,1.68,1.39,1.19,1.03]),reverseRatio:3.0,finalDrive:3.90,efficiency:.94,
    idleRpm:1200,launchRpm:2600,upshiftRpm:8750,downshiftRpm:4200,shiftSeconds:.085,shiftCooldown:.18,engineBrakeNm:60,
    brakeTorqueNm:5500,brakeBias:.58,tyreMu:1.65,corneringFactor:20,longitudinalFactor:18,
    wheelInertia:1.65,relaxationMetres:.35,ambientC:25,initialTyreC:80,coldPressureBar:1.45,
    loadSensitivity:.10,brakeHeatCapacity:4800,tyreHeatCapacity:14500,diffPreloadNm:65,diffLock:.28,
    pitchInertia:600,rollInertia:420,pitchStiffness:140000,rollStiffness:110000,pitchDamping:9000,rollDamping:7500,
    physicsHz:240});
  const CIRCUIT_METRICS=Object.freeze({
    monza:{lengthM:5793,referenceMps:45,source:'https://www.monzanet.it/en/circuit/'},
    monaco:{lengthM:3337,referenceMps:32,source:'https://www.formula1.com/en/information/monaco-circuit-de-monaco-monte-carlo.2ZWRtIcSI6ZzVGX1uGRpkJ'},
    'le-mans':{lengthM:13626,referenceMps:53,source:'https://www.24h-lemans.com/en/info/the-race'}
  });
  function configureTrack(track,id='lab'){
    const reference=CIRCUIT_METRICS[id];
    track.pixelsPerMeter=track.dimensions?.coordinateUnit==='metre'?1:reference?track.total/reference.lengthM:1;
    track.lengthMeters=track.total/track.pixelsPerMeter;track.metricSource=reference?.source||null;
    track.metricSource=track.dimensions?.lengthSource||track.metricSource;
    track.metricNotice=track.widthMeters?'1 unità = 1 metro. Larghezze locali stimate; sensori, collisioni e mappa condividono gli stessi bordi. Raggi di curva derivati dalla mappa, non da un rilievo.':reference?'Lunghezza del giro calibrata; larghezze e raggi locali restano approssimazioni della mappa.':'Pista di laboratorio: 1 unità = 1 metro, geometria sintetica.';
    track.vehicleScale=SPEC.lengthM*track.pixelsPerMeter/24;
    // Safety bound for numerics/scoring only. No circuit-specific speed governor.
    track.speedLimit=120*track.pixelsPerMeter;
    track.lapReferenceSpeed=(reference?.referenceMps||35)*track.pixelsPerMeter;
    track.physicsRevision=REVISION;
    Terrain.attach(track,id);
    return track;
  }
  function tyre(){return {omega:0,slip:0,slipAngle:0,fx:0,fy:0,fz:0,grip:0,temperatureC:MODEL.initialTyreC,wear:0,pressureBar:(MODEL.coldPressureBar+1.01325)*(MODEL.initialTyreC+273.15)/(MODEL.ambientC+273.15)-1.01325,brakeC:MODEL.ambientC,absFactor:1,absActive:false,travelM:0};}
  function createState(){return {revision:REVISION,modelId:SPEC.id,u:0,v:0,r:0,rpm:MODEL.idleRpm,gear:1,targetGear:1,gearboxMode:'auto',shiftRemaining:0,shiftCooldown:0,shifts:0,shiftRejected:0,
    fuelL:MODEL.startFuelL,massKg:SPEC.baseMassKg+MODEL.driverKg+MODEL.startFuelL*MODEL.fuelDensity,
    wheels:[tyre(),tyre(),tyre(),tyre()],absEnabled:true,tcEnabled:true,tcFactor:1,tcActive:false,absActive:false,
    brakeBias:MODEL.brakeBias,steeringAngle:0,ax:0,ay:0,engineTorqueNm:0,enginePowerKw:0,clutch:0,limiter:false,
    dragN:0,downforceN:0,pitch:0,roll:0,pitchRate:0,rollRate:0,distanceM:0,speedMps:0,simulationSeconds:0,
    elevationM:0,roadGradePercent:0,roadPitch:0,roadRoll:0,gravityX:0,gravityY:0,gravityNormal:G,supportAcceleration:G,normalG:1,verticalVelocityMps:0};}
  function torqueAt(rpm){
    // Piecewise estimated curve, capped by the published nominal max power.
    const points=[[0,0],[1200,230],[3000,405],[5000,510],[6500,550],[8000,520],[9250,420],[10000,0]];
    const value=clamp(rpm,0,10000);let torque=0;
    for(let i=1;i<points.length;i++)if(value<=points[i][0]){const a=points[i-1],b=points[i];torque=a[1]+(b[1]-a[1])*(value-a[0])/(b[0]-a[0]);break;}
    return Math.min(torque,SPEC.maxPowerW/Math.max(1,value/RPM));
  }
  function ratio(gear){return gear===-1?-MODEL.reverseRatio:MODEL.gearRatios[gear]||0;}
  function wheelRpm(state,gear=state.gear){return Math.abs((state.wheels[2].omega+state.wheels[3].omega)*.5*ratio(gear)*MODEL.finalDrive*RPM);}
  function requestGear(state,gear){
    if(!Number.isInteger(gear)||gear< -1||gear>SPEC.gears||state.shiftRemaining>0||state.shiftCooldown>0)return false;
    if(gear===state.gear)return true;
    if((gear===-1||state.gear===-1)&&Math.abs(state.u)>1){state.shiftRejected++;return false;}
    if(gear>0&&wheelRpm(state,gear)>SPEC.maxRpm-150){state.shiftRejected++;return false;}
    state.targetGear=gear;state.shiftRemaining=MODEL.shiftSeconds;state.shiftCooldown=MODEL.shiftSeconds+MODEL.shiftCooldown;state.shifts++;return true;
  }
  function shift(state,direction){return requestGear(state,clamp(state.gear+Math.sign(direction),-1,SPEC.gears));}
  function synchroniseSpeed(state,speedMps){
    state.u=Math.max(0,speedMps);state.v=0;state.r=0;
    state.wheels.forEach((w,i)=>{w.omega=state.u/(i<2?SPEC.frontRadiusM:SPEC.rearRadiusM);w.slip=0;w.fx=0;w.fy=0;});
    state.rpm=Math.max(MODEL.idleRpm,wheelRpm(state));state.speedMps=state.u;
  }
  function stop(car){
    // Wall hits terminate an episode, not a simulated deformable crash. Keep
    // the last force/thermal sample, but do not display a moving dead body.
    const s=car.vehicle;
    if(s){s.u=0;s.v=0;s.r=0;s.speedMps=0;s.verticalVelocityMps=0;s.wheels.forEach(w=>{w.omega=0;});}
    car.speed=car._physicsSpeed=car.longitudinalVelocity=car.lateralVelocity=car.yawRate=car.velocityX=car.velocityY=0;
  }
  function tyreCapacity(w,fz){
    const heat=.70+.30*Math.exp(-(((w.temperatureC-85)/42)**2)),pressure=clamp(1-Math.abs(w.pressureBar-1.9)*.12,.7,1);
    return MODEL.tyreMu*heat*pressure*(1-.35*w.wear)*Math.pow(Math.max(.1,fz/3500),-MODEL.loadSensitivity)*fz;
  }
  function combinedForce(slip,angle,fz,capacity){
    const nx=MODEL.longitudinalFactor*fz*slip,ny=-MODEL.corneringFactor*fz*Math.tan(clamp(angle,-1.3,1.3));
    const magnitude=Math.hypot(nx,ny),factor=magnitude>1e-9?capacity*Math.tanh(magnitude/Math.max(1,capacity))/magnitude:0;
    return {fx:nx*factor,fy:ny*factor};
  }
  function normalLoads(s){
    const mass=s.massKg,weight=mass*(s.supportAcceleration??G),frontStatic=weight*MODEL.frontWeight+s.downforceN*MODEL.aeroFront;
    const longitudinal=mass*(s.ax-(s.gravityX||0))*MODEL.cgHeightM/SPEC.wheelbaseM;
    const front=clamp(frontStatic-longitudinal,weight*.06,weight+s.downforceN-weight*.06),rear=weight+s.downforceN-front;
    const rollTransfer=mass*(s.ay-(s.gravityY||0))*MODEL.cgHeightM,frontTransfer=rollTransfer*.48/MODEL.frontTrackM,rearTransfer=rollTransfer*.52/MODEL.rearTrackM;
    const ft=clamp(frontTransfer,-front*.47,front*.47),rt=clamp(rearTransfer,-rear*.47,rear*.47);
    // Wheel order: FL, FR, RL, RR. Positive lateral acceleration loads left.
    return [front*.5+ft,front*.5-ft,rear*.5+rt,rear*.5-rt];
  }
  function solveWheel(w,vx,vy,radius,fz,driveNm,brakeNm,h){
    const direction=Math.abs(vx)>.1?Math.sign(vx):Math.sign(driveNm||w.omega)||1;
    const forward=vx*direction,old=w.omega*direction,drive=driveNm*direction,denom=Math.max(1.2,Math.abs(vx));
    const angle=Math.atan2(vy,Math.max(1.2,Math.abs(vx)));
    const relax=1-Math.exp(-h*Math.max(3,Math.abs(vx))/MODEL.relaxationMetres),targetAngle=w.slipAngle+(angle-w.slipAngle)*relax;
    const capacity=tyreCapacity(w,fz);
    const force=q=>combinedForce((q*radius-forward)/denom,targetAngle,fz,capacity);
    const residual=q=>MODEL.wheelInertia*(q-old)/h-drive+brakeNm+force(q).fx*radius;
    let q=0;
    if(residual(0)<0){
      let lo=0,hi=Math.max(1,old+Math.max(0,drive)*h/MODEL.wheelInertia+Math.abs(vx)/radius);
      // Monotonic implicit tyre/rotational solve prevents zero-speed explosion.
      for(let i=0;i<15;i++){const mid=(lo+hi)*.5;if(residual(mid)>0)hi=mid;else lo=mid;}q=(lo+hi)*.5;
    }
    const f=force(q);w.omega=q*direction;w.slip=(q*radius-forward)/denom;w.slipAngle=targetAngle;
    w.fx=f.fx*direction;w.fy=f.fy;w.fz=fz;w.grip=capacity;
    const slipPower=Math.abs(w.fx*(w.omega*radius-vx))+Math.abs(w.fy*vy),cooling=(12+Math.abs(vx)*2.5)*(w.temperatureC-MODEL.ambientC);
    w.temperatureC=clamp(w.temperatureC+(slipPower*.65+Math.abs(w.fx*vx)*.018-cooling)*h/MODEL.tyreHeatCapacity,MODEL.ambientC,180);
    w.wear=clamp(w.wear+slipPower*h/8e8,0,1);w.travelM+=Math.abs(vx)*h;
    w.pressureBar=(MODEL.coldPressureBar+1.01325)*(w.temperatureC+273.15)/(MODEL.ambientC+273.15)-1.01325;
    w.brakeC=clamp(w.brakeC+(brakeNm*Math.abs(w.omega)-(8+Math.abs(vx)*1.2)*(w.brakeC-MODEL.ambientC))*h/MODEL.brakeHeatCapacity,MODEL.ambientC,1200);
    return f;
  }
  function substep(s,steer,throttle,brake,h){
    s.massKg=SPEC.baseMassKg+MODEL.driverKg+s.fuelL*MODEL.fuelDensity;
    const speed=Math.hypot(s.u,s.v),q=.5*MODEL.airDensity*speed*speed;
    s.downforceN=q*MODEL.downforceArea;s.dragN=q*MODEL.dragArea;
    s.steeringAngle+=clamp(steer*.58-s.steeringAngle,-1.8*h,1.8*h);
    s.shiftCooldown=Math.max(0,s.shiftCooldown-h);
    if(s.shiftRemaining>0){s.shiftRemaining=Math.max(0,s.shiftRemaining-h);if(s.shiftRemaining===0)s.gear=s.targetGear;}
    if(s.gearboxMode==='auto'&&s.gear>0&&s.shiftRemaining===0&&s.shiftCooldown===0){
      const revs=wheelRpm(s);
      if(revs>MODEL.upshiftRpm&&s.gear<SPEC.gears)requestGear(s,s.gear+1);
      else if(revs<MODEL.downshiftRpm&&s.gear>1&&wheelRpm(s,s.gear-1)<SPEC.maxRpm-1000)requestGear(s,s.gear-1);
    }
    const coupled=wheelRpm(s),launch=MODEL.idleRpm+throttle*(MODEL.launchRpm-MODEL.idleRpm);
    const targetRpm=Math.max(MODEL.idleRpm,coupled,Math.abs(s.u)<7?launch:0);
    s.rpm+=clamp(targetRpm-s.rpm,-30000*h,30000*h);s.rpm=clamp(s.rpm,MODEL.idleRpm,12000);
    s.clutch=s.gear===0||s.shiftRemaining>0?0:clamp(Math.abs(s.u)/5+.2+throttle*.8,0,1);
    s.limiter=s.rpm>=SPEC.maxRpm;
    const rearSlip=Math.max(s.wheels[2].slip,s.wheels[3].slip);
    s.tcActive=s.tcEnabled&&throttle>0&&rearSlip>.12;
    const tcTarget=s.tcActive?clamp(.12/Math.max(.12,rearSlip),.06,1):1;s.tcFactor+=(tcTarget-s.tcFactor)*Math.min(1,h/.045);
    const available=s.fuelL>0&&!s.limiter&&s.shiftRemaining===0?torqueAt(s.rpm)*throttle*s.tcFactor:0;
    s.engineTorqueNm=available;s.enginePowerKw=available*s.rpm/RPM/1000;
    const engineBrake=throttle===0&&coupled>MODEL.idleRpm?MODEL.engineBrakeNm*(coupled/SPEC.maxRpm):0;
    const shaft=(available-engineBrake)*ratio(s.gear)*MODEL.finalDrive*MODEL.efficiency*s.clutch;
    const diff=clamp((s.wheels[3].omega-s.wheels[2].omega)*30,-MODEL.diffPreloadNm-Math.abs(shaft)*MODEL.diffLock,MODEL.diffPreloadNm+Math.abs(shaft)*MODEL.diffLock);
    const frontX=SPEC.wheelbaseM*(1-MODEL.frontWeight),rearX=-SPEC.wheelbaseM*MODEL.frontWeight,loads=normalLoads(s);
    let fx=0,fy=0,moment=0;s.absActive=false;
    for(let i=0;i<4;i++){
      const w=s.wheels[i],front=i<2,x=front?frontX:rearX,y=(i%2===0?-1:1)*(front?MODEL.frontTrackM:MODEL.rearTrackM)*.5;
      // Low-speed Ackermann; four contact-patch velocities include yaw.
      const delta=front?Math.atan2(SPEC.wheelbaseM*Math.tan(s.steeringAngle),SPEC.wheelbaseM-y*Math.tan(s.steeringAngle)):0;
      const cos=Math.cos(delta),sin=Math.sin(delta),bodyX=s.u-s.r*y,bodyY=s.v+s.r*x;
      const vx=cos*bodyX+sin*bodyY,vy=-sin*bodyX+cos*bodyY;
      w.absActive=s.absEnabled&&brake>0&&Math.abs(vx)>2&&w.slip<-.10;
      w.absFactor=clamp(w.absFactor+h*(w.absActive?-20:5),.12,1);s.absActive=s.absActive||w.absActive;
      const fade=clamp(1-Math.max(0,w.brakeC-750)/800,.4,1),bias=front?s.brakeBias:1-s.brakeBias;
      const brakeNm=brake*MODEL.brakeTorqueNm*bias*.5*fade*(s.absEnabled?w.absFactor:1);
      solveWheel(w,vx,vy,front?SPEC.frontRadiusM:SPEC.rearRadiusM,loads[i],front?0:shaft*.5+(i===2?diff:-diff),brakeNm,h);
      const bx=w.fx*cos-w.fy*sin,by=w.fx*sin+w.fy*cos;
      fx+=bx;fy+=by;moment+=x*by-y*bx;
    }
    const rolling=MODEL.rollingCoefficient*s.massKg*(s.gravityNormal??G)*Math.tanh(s.u/.4);
    const dragX=speed>1e-6?s.dragN*s.u/speed:0,dragY=speed>1e-6?s.dragN*s.v/speed:0;
    s.ax=(fx-rolling-dragX)/s.massKg+(s.gravityX||0);s.ay=(fy-dragY)/s.massKg+(s.gravityY||0);
    const du=s.ax+s.v*s.r,dv=s.ay-s.u*s.r;
    s.u+=du*h;s.v+=dv*h;s.r+=moment/MODEL.yawInertia*h;
    const staticBrake=brake*MODEL.brakeTorqueNm/(SPEC.rearRadiusM*s.massKg),staticGravity=Math.hypot(s.gravityX||0,s.gravityY||0);
    if(throttle===0&&Math.abs(s.u)<.08&&Math.abs(s.v)<.04&&Math.abs(s.r)<.04&&(staticGravity===0||staticBrake>staticGravity&&brake>.05)){s.u=0;s.v=0;s.r=0;s.wheels.forEach(w=>{w.omega=0;});}
    // Sprung-body response is relative to the ground plane. No airborne or
    // deformable-suspension model is claimed. Grade is not body-pitch feedback.
    s.pitchRate+=(s.massKg*(s.ax-(s.gravityX||0))*MODEL.cgHeightM-MODEL.pitchStiffness*s.pitch-MODEL.pitchDamping*s.pitchRate)/MODEL.pitchInertia*h;
    s.rollRate+=(s.massKg*(s.ay-(s.gravityY||0))*MODEL.cgHeightM-MODEL.rollStiffness*s.roll-MODEL.rollDamping*s.rollRate)/MODEL.rollInertia*h;
    s.pitch+=s.pitchRate*h;s.roll+=s.rollRate*h;
    const power=s.enginePowerKw*1000;s.fuelL=Math.max(0,s.fuelL-h*(.0007+power/(.30*43e6*MODEL.fuelDensity)));
    s.speedMps=Math.hypot(s.u,s.v);s.distanceM+=s.speedMps*h;s.simulationSeconds+=h;
    if(![s.u,s.v,s.r,s.rpm,s.ax,s.ay].every(Number.isFinite)||s.speedMps>150||Math.abs(s.r)>15)throw Error('Stato fisico Porsche non valido');
  }
  function surfaceState(s,sample,heading){
    const frame=Terrain.frame(sample,heading),vx=frame.forward[0]*s.u+frame.side[0]*s.v,vy=frame.forward[2]*s.u+frame.side[2]*s.v;
    s.elevationM=frame.height;s.roadPitch=frame.pitch;s.roadRoll=frame.roll;s.roadGradePercent=Math.tan(frame.pitch)*100;
    s.gravityX=-G*frame.forward[1];s.gravityY=-G*frame.side[1];s.gravityNormal=G*frame.normal[1];
    const normalAcceleration=((sample.hxx||0)*vx*vx+2*(sample.hxy||0)*vx*vy+(sample.hyy||0)*vy*vy)*frame.normal[1];
    s.supportAcceleration=Math.max(0,s.gravityNormal+normalAcceleration);s.normalG=s.supportAcceleration/G;
    s.verticalVelocityMps=frame.forward[1]*s.u+frame.side[1]*s.v;return frame;
  }
  function placeOnSurface(car,ground){if(ground&&!ground.flat)surfaceState(car.vehicle,ground.sample(car.x,car.y),car.heading);}
  function step(car,commands,dt,ground=null){
    if(!Number.isFinite(dt)||dt<=0||dt>.1)throw Error('Passo fisico non valido');
    const s=car.vehicle||(car.vehicle=createState()),ppm=car.pixelsPerMeter||1;
    if(Math.abs(car.speed-(car._physicsSpeed??car.speed))>1e-7)synchroniseSpeed(s,car.speed/ppm);
    const n=Math.ceil(dt*MODEL.physicsHz-1e-8),h=dt/n;let dx=0,dy=0,heading=car.heading;
    for(let i=0;i<n;i++){
      const tilted=ground&&!ground.flat,frame=tilted?surfaceState(s,ground.sample(car.x+dx*ppm,car.y+dy*ppm),heading):null;
      substep(s,commands[0],commands[1],commands[2],h);
      const mid=heading+s.r*h*.5;
      if(frame){const f=Terrain.frame(ground.sample(car.x+dx*ppm,car.y+dy*ppm),mid);dx+=(f.forward[0]*s.u+f.side[0]*s.v)*h;dy+=(f.forward[2]*s.u+f.side[2]*s.v)*h;}
      else{dx+=(Math.cos(mid)*s.u-Math.sin(mid)*s.v)*h;dy+=(Math.sin(mid)*s.u+Math.cos(mid)*s.v)*h;}
      heading+=s.r*h;
    }
    car.x+=dx*ppm;car.y+=dy*ppm;car.heading=heading%(2*Math.PI);car.steer=s.steeringAngle/.58;
    car.longitudinalVelocity=s.u*ppm;car.lateralVelocity=s.v*ppm;car.yawRate=s.r;
    const finalFrame=ground&&!ground.flat?surfaceState(s,ground.sample(car.x,car.y),heading):null;
    car.velocityX=(finalFrame?finalFrame.forward[0]*s.u+finalFrame.side[0]*s.v:Math.cos(heading)*s.u-Math.sin(heading)*s.v)*ppm;car.velocityY=(finalFrame?finalFrame.forward[2]*s.u+finalFrame.side[2]*s.v:Math.sin(heading)*s.u+Math.cos(heading)*s.v)*ppm;
    car.speed=s.speedMps*ppm;car._physicsSpeed=car.speed;
    car.longitudinalAcceleration=s.ax;car.lateralAcceleration=s.ay;car.longitudinalG=(s.ax-s.gravityX)/G;car.lateralG=(s.ay-s.gravityY)/G;car.totalG=finalFrame?Math.hypot(car.longitudinalG,car.lateralG,s.normalG-1):Math.hypot(s.ax,s.ay)/G;
    car.loadTransfer=clamp(car.lateralG*MODEL.cgHeightM/MODEL.frontTrackM+car.longitudinalG*MODEL.cgHeightM/SPEC.wheelbaseM,-1,1);
    car.slipAngle=Math.abs(s.u)<.1?0:Math.atan2(s.v,Math.abs(s.u));
    car.distance+=s.speedMps*dt*ppm;car.lifetime+=dt;
  }
  function telemetry(s,full=false){
    if(!s)return null;
    const average=key=>s.wheels.reduce((a,w)=>a+w[key],0)/4;
    const view={revision:s.revision,modelId:s.modelId,speedMps:s.speedMps,rpm:s.rpm,gear:s.gear,targetGear:s.targetGear,gearboxMode:s.gearboxMode,shiftRemaining:s.shiftRemaining,shifts:s.shifts,shiftRejected:s.shiftRejected,
      fuelL:s.fuelL,massKg:s.massKg,engineTorqueNm:s.engineTorqueNm,enginePowerKw:s.enginePowerKw,clutch:s.clutch,limiter:s.limiter,
      absEnabled:s.absEnabled,tcEnabled:s.tcEnabled,absActive:s.absActive,tcActive:s.tcActive,tcFactor:s.tcFactor,brakeBias:s.brakeBias,
      tyreC:average('temperatureC'),tyreWear:average('wear'),pressureBar:average('pressureBar'),brakeC:average('brakeC'),
      rearSlip:(s.wheels[2].slip+s.wheels[3].slip)*.5,frontSlip:(s.wheels[0].slip+s.wheels[1].slip)*.5,
      downforceN:s.downforceN,dragN:s.dragN,pitch:s.pitch,roll:s.roll,distanceM:s.distanceM,
      elevationM:s.elevationM,roadGradePercent:s.roadGradePercent,roadPitch:s.roadPitch,roadRoll:s.roadRoll,normalG:s.normalG,verticalVelocityMps:s.verticalVelocityMps};
    if(full)view.wheels=s.wheels.map(w=>({...w}));return view;
  }
  const api={SPEC,MODEL,REVISION,G,CIRCUIT_METRICS,configureTrack,createState,torqueAt,ratio,requestGear,shift,synchroniseSpeed,stop,combinedForce,normalLoads,step,telemetry,Terrain,placeOnSurface};
  return api;
});
