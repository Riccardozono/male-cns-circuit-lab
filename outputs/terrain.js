/* Shared world-surface sampler, used by physics and rendering only. It never
 * changes XY position, heading, neural observations or driving commands. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./data/terrain.js'));else root.MaleCNSTerrain=factory(root.MaleCNSTerrainData);})(typeof globalThis!=='undefined'?globalThis:this,function(Data){
  'use strict';
  const cache=new WeakMap(),clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),wrap=(x,n)=>((x%n)+n)%n;
  function attach(track,id='lab'){
    const entry=track.widthStations?.length?Data.profiles[id]||Data.profiles.lab:Data.profiles.lab,anchors=entry.anchors.map(([label,height])=>{const station=track.widthStations?.find(s=>s.label===label);if(!station)throw Error('Ancoraggio altimetrico mancante: '+label);return {s:station.alongMeters,height,label,estimated:true};});
    track.terrainProfile={revision:Data.revision,id,estimated:true,reference:entry.reference,notice:entry.notice,anchors};cache.delete(track);return track;
  }
  function createProfile(anchors,total){
    if(!anchors.length)return {at:()=>({height:0,slope:0,curvature:0}),min:0,max:0};
    const n=anchors.length,h=[],d=[],m=[];
    for(let i=0;i<n;i++){const j=(i+1)%n;h[i]=wrap(anchors[j].s-anchors[i].s,total)||total;d[i]=(anchors[j].height-anchors[i].height)/h[i];}
    for(let i=0;i<n;i++){const p=(i+n-1)%n,w1=2*h[i]+h[p],w2=h[i]+2*h[p];m[i]=d[p]*d[i]<=0?0:(w1+w2)/(w1/d[p]+w2/d[i]);}
    return {min:Math.min(...anchors.map(a=>a.height)),max:Math.max(...anchors.map(a=>a.height)),at(s){
      s=wrap(s,total);let i=n-1;for(let j=0;j<n-1;j++)if(s>=anchors[j].s&&s<anchors[j+1].s){i=j;break;}
      const t=wrap(s-anchors[i].s,total)/h[i],a=anchors[i].height,b=anchors[(i+1)%n].height,u=m[i]*h[i],v=m[(i+1)%n]*h[i];
      const c0=a,c1=u,c2=-3*a+3*b-2*u-v,c3=2*a-2*b+u+v;
      return {height:c0+c1*t+c2*t*t+c3*t*t*t,slope:(c1+2*c2*t+3*c3*t*t)/h[i],curvature:(2*c2+6*c3*t)/(h[i]*h[i])};
    }};
  }
  function forTrack(track){
    if(cache.has(track))return cache.get(track);
    const ppm=track.pixelsPerMeter||1,total=track.total/ppm,meta=track.terrainProfile||{anchors:[],revision:Data.revision,id:'lab',estimated:true},profile=createProfile(meta.anchors,total),segments=[],grid=new Map(),cell=48*ppm;
    let arc=0;
    for(let i=0;i<track.center.length;i++){
      const a=track.center[i],b=track.center[(i+1)%track.center.length],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy),segment={a,b,dx,dy,len,s:arc/ppm,index:i};segments.push(segment);arc+=len;
      for(let x=Math.floor(Math.min(a.x,b.x)/cell);x<=Math.floor(Math.max(a.x,b.x)/cell);x++)for(let y=Math.floor(Math.min(a.y,b.y)/cell);y<=Math.floor(Math.max(a.y,b.y)/cell);y++){const key=x+','+y;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(segment);}
    }
    function nearest(x,y){
      const cx=Math.floor(x/cell),cy=Math.floor(y/cell),candidates=new Set();
      for(let r=0;r<=2;r++){for(let gx=cx-r;gx<=cx+r;gx++)for(let gy=cy-r;gy<=cy+r;gy++)for(const s of grid.get(gx+','+gy)||[])candidates.add(s);if(candidates.size&&r>=1)break;}
      let best=null,distance=Infinity;for(const s of candidates.size?candidates:segments){const t=clamp(((x-s.a.x)*s.dx+(y-s.a.y)*s.dy)/(s.len*s.len||1),0,1),d=(x-s.a.x-s.dx*t)**2+(y-s.a.y-s.dy*t)**2;if(d<distance){distance=d;best={s,t,distance:Math.sqrt(d)/ppm};}}
      return best;
    }
    const sampler={meta,profile,ppm,total,flat:profile.min===profile.max,
      sample(x,y){if(this.flat)return {height:0,gx:0,gy:0,hxx:0,hxy:0,hyy:0};const p=nearest(x,y),q=profile.at(p.s.s+p.t*p.s.len/ppm),tx=p.s.dx/(p.s.len||1),ty=p.s.dy/(p.s.len||1);return {height:q.height-profile.min,gx:q.slope*tx,gy:q.slope*ty,hxx:q.curvature*tx*tx,hxy:q.curvature*tx*ty,hyy:q.curvature*ty*ty,distance:p.distance};},
      visualHeight(x,y){if(this.flat)return 0;const p=nearest(x,y),q=profile.at(p.s.s+p.t*p.s.len/ppm),distance=Math.max(0,p.distance-10);return (q.height-profile.min)*Math.exp(-distance*distance/(95*95));},
      info(){let maxGrade=0,length3D=0;for(let s=0;s<total;s+=2){const a=profile.at(s),b=profile.at(Math.min(total,s+2)),ds=Math.min(2,total-s);maxGrade=Math.max(maxGrade,Math.abs(a.slope));length3D+=Math.hypot(ds,b.height-a.height);}return {revision:Data.revision,estimated:true,rangeM:profile.max-profile.min,maxGradePercent:maxGrade*100,planLengthM:total,surfaceLengthM:length3D,reference:meta.reference,notice:meta.notice};}
    };cache.set(track,sampler);return sampler;
  }
  function frame(sample,heading){const c=Math.cos(heading),s=Math.sin(heading),gx=sample.gx||0,gy=sample.gy||0,p=gx*c+gy*s,l=Math.hypot(1,p),n=Math.hypot(1,gx,gy);
    const forward=[c/l,p/l,s/l],normal=[-gx/n,1/n,-gy/n],side=[forward[1]*normal[2]-forward[2]*normal[1],forward[2]*normal[0]-forward[0]*normal[2],forward[0]*normal[1]-forward[1]*normal[0]];
    return {forward,normal,side,pitch:Math.atan(p),roll:Math.atan(-gx*s+gy*c),height:sample.height||0};}
  return {attach,forTrack,createProfile,frame,revision:Data.revision};
});
