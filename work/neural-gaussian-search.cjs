'use strict';
function cholesky(cov){
  const n=cov.length;if(!n||cov.some(r=>r.length!==n||r.some(v=>!Number.isFinite(v))))throw Error('Finite square covariance required');
  const lower=Array.from({length:n},()=>Array(n).fill(0));
  for(let i=0;i<n;i++)for(let j=0;j<=i;j++){
    if(Math.abs(cov[i][j]-cov[j][i])>1e-12)throw Error('Symmetric covariance required');
    let value=cov[i][j];for(let k=0;k<j;k++)value-=lower[i][k]*lower[j][k];
    if(i===j){if(value<=0)throw Error('Positive covariance required');lower[i][j]=Math.sqrt(value);}else lower[i][j]=value/lower[j][j];
  }return lower;
}
function transform(cov,z){const lower=cholesky(cov);if(z.length!==lower.length||z.some(v=>!Number.isFinite(v)))throw Error('Finite Gaussian innovations required');
  return lower.map((row,i)=>row.slice(0,i+1).reduce((sum,v,j)=>sum+v*z[j],0));}
function update(previous,elite){
  const n=previous.mean.length;cholesky(previous.cov);
  if(!n||previous.cov.length!==n||previous.mean.some(v=>!Number.isFinite(v)||Math.abs(v)>3)||!elite.length||
    elite.some(v=>v.length!==n||v.some(x=>!Number.isFinite(x)||Math.abs(x)>3)))throw Error('Bounded equal-dimensional CEM vectors required');
  const rank=elite.map((_,i)=>Math.log(elite.length+.5)-Math.log(i+1)),sum=rank.reduce((a,b)=>a+b,0),mean=Array(n).fill(0),cov=Array.from({length:n},()=>Array(n).fill(0));
  for(let i=0;i<elite.length;i++)for(let a=0;a<n;a++)mean[a]+=rank[i]/sum*elite[i][a];
  for(let i=0;i<elite.length;i++)for(let a=0;a<n;a++)for(let b=0;b<n;b++)cov[a][b]+=rank[i]/sum*(elite[i][a]-mean[a])*(elite[i][b]-mean[b]);
  const next={mean:mean.map((v,a)=>.6*v+.4*previous.mean[a]),cov:cov.map((row,a)=>row.map((v,b)=>.6*v+.4*previous.cov[a][b]+(a===b?.02**2:0)))};
  cholesky(next.cov);return next;
}
module.exports={cholesky,transform,update};
