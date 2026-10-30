'use strict';
// Research-only output rescaling. The calibration rows contain actual neural
// activity, not sensors, positions, desired actions, a route or a new driver.
function action(policy,weights,features){
  const n=policy.nodes.length,norm=1/Math.sqrt(n);let steering=weights.at(-2),longitudinal=weights.at(-1);
  for(let j=0;j<n;j++){steering+=features[j]*weights[policy.readoutOffset+j*2]*norm;longitudinal+=features[j]*weights[policy.readoutOffset+j*2+1]*norm;}
  return [Math.tanh(steering),Math.tanh(longitudinal)];
}
function response(policy,parent,child,rows){
  let ss=0,ll=0,max=0;
  for(const x of rows){const a=action(policy,parent,x),b=action(policy,child,x),s=b[0]-a[0],l=b[1]-a[1];ss+=s*s;ll+=l*l;max=Math.max(max,Math.abs(s),Math.abs(l));}
  const rmsSteering=Math.sqrt(ss/rows.length),rmsLongitudinal=Math.sqrt(ll/rows.length);
  return {rmsSteering,rmsLongitudinal,rms:Math.max(rmsSteering,rmsLongitudinal),max};
}
function rescale(policy,parent,raw,rows,{rmsLimit,maxLimit}){
  if(!rows.length||rows.some(x=>x.length!==policy.nodes.length||x.some(v=>!Number.isFinite(v))))throw Error('Actual neural calibration rows required');
  if(!(rmsLimit>0&&maxLimit>=rmsLimit)||parent.length!==raw.length)throw Error('Invalid output mutation budget');
  const delta=raw.map((v,i)=>v-parent[i]);
  if(delta.slice(0,policy.readoutOffset).some(v=>v!==0))throw Error('This calibration can rescale only the neural motor readout');
  const at=(factor,sign=1)=>parent.map((v,i)=>v+sign*factor*delta[i]);
  const fits=factor=>{
    for(const sign of [1,-1]){
      const child=at(factor,sign);if(child.some(v=>!Number.isFinite(v)||Math.abs(v)>8+1e-12))return false;
      const r=response(policy,parent,child,rows);if(r.rms>rmsLimit||r.max>maxLimit)return false;
    }return true;
  };
  let factor=1;
  if(!fits(1)){let lo=0,hi=1;for(let i=0;i<30;i++){const mid=(lo+hi)/2;if(fits(mid))lo=mid;else hi=mid;}factor=lo;}
  const child=at(factor),mirror=at(factor,-1);
  return {factor,child,mirror,response:response(policy,parent,child,rows),mirrorResponse:response(policy,parent,mirror,rows)};
}
module.exports={action,response,rescale};
