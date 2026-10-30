'use strict';
// Positive-weight CMA-ES, with rank-one/rank-mu covariance and CSA.
// Algorithm reference: Hansen, https://arxiv.org/abs/1604.00772.
// This optimizer receives fitness only; it cannot access a track or a car.
const normal=r=>Math.sqrt(-2*Math.log(Math.max(1e-12,r())))*Math.cos(2*Math.PI*r());
const identity=n=>Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>Number(i===j)));
const multiply=(a,x)=>a.map(row=>row.reduce((s,v,j)=>s+v*x[j],0));
function eigen(matrix){
  const n=matrix.length,a=matrix.map(row=>row.slice()),b=identity(n);
  for(let iteration=0;iteration<100*n*n;iteration++){
    let p=0,q=1,largest=0;
    for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)if(Math.abs(a[i][j])>largest){largest=Math.abs(a[i][j]);p=i;q=j;}
    if(largest<1e-13*Math.max(1,...a.map((row,i)=>Math.abs(row[i]))))break;
    const angle=.5*Math.atan2(2*a[p][q],a[q][q]-a[p][p]),c=Math.cos(angle),s=Math.sin(angle),app=a[p][p],aqq=a[q][q],apq=a[p][q];
    a[p][p]=c*c*app-2*s*c*apq+s*s*aqq;a[q][q]=s*s*app+2*s*c*apq+c*c*aqq;a[p][q]=a[q][p]=0;
    for(let j=0;j<n;j++)if(j!==p&&j!==q){const x=a[j][p],y=a[j][q];a[j][p]=a[p][j]=c*x-s*y;a[j][q]=a[q][j]=s*x+c*y;}
    for(let i=0;i<n;i++){const x=b[i][p],y=b[i][q];b[i][p]=c*x-s*y;b[i][q]=s*x+c*y;}
  }
  const values=a.map((row,i)=>Math.max(1e-16,row[i]));
  return {values,vectors:b};
}
class CMA {
  constructor(mean,sigma=.5,population=4+Math.floor(3*Math.log(mean.length))){
    if(!Array.isArray(mean)||mean.length<2||mean.some(v=>!Number.isFinite(v))||!Number.isFinite(sigma)||sigma<=0||!Number.isInteger(population)||population<4)throw Error('Invalid CMA settings');
    this.n=mean.length;this.mean=mean.slice();this.sigma=sigma;this.population=population;this.generation=0;
    this.mu=Math.floor(population/2);this.weights=Array.from({length:this.mu},(_,i)=>Math.log(this.mu+.5)-Math.log(i+1));const sum=this.weights.reduce((s,v)=>s+v,0);this.weights=this.weights.map(v=>v/sum);
    const n=this.n,m=this.mueff=1/this.weights.reduce((s,v)=>s+v*v,0);
    this.cc=(4+m/n)/(n+4+2*m/n);this.cs=(m+2)/(n+m+5);this.c1=2/((n+1.3)**2+m);this.cmu=Math.min(1-this.c1,2*(m-2+1/m)/((n+2)**2+m));this.damps=1+2*Math.max(0,Math.sqrt((m-1)/(n+1))-1)+this.cs;
    this.expectedNorm=Math.sqrt(n)*(1-1/(4*n)+1/(21*n*n));this.pc=Array(n).fill(0);this.ps=Array(n).fill(0);this.covariance=identity(n);
  }
  ask(random){
    const {values,vectors}=eigen(this.covariance),root=vectors.map(row=>row.map((v,j)=>v*Math.sqrt(values[j])));
    return Array.from({length:this.population},()=>{const z=Array.from({length:this.n},()=>normal(random)),y=multiply(root,z);return {x:this.mean.map((v,j)=>v+this.sigma*y[j]),y};});
  }
  tell(candidates){
    if(candidates.length!==this.population||candidates.some(c=>!Number.isFinite(c.fitness)||c.x.length!==this.n||c.x.some(v=>!Number.isFinite(v))))throw Error('Invalid CMA fitness batch');
    const chosen=candidates.toSorted((a,b)=>b.fitness-a.fitness).slice(0,this.mu),old=this.mean.slice(),n=this.n;
    this.mean=Array.from({length:n},(_,j)=>chosen.reduce((s,c,k)=>s+this.weights[k]*c.x[j],0));const y=this.mean.map((v,j)=>(v-old[j])/this.sigma),{values,vectors}=eigen(this.covariance);
    const whiten=Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>vectors[i].reduce((s,v,k)=>s+v*vectors[j][k]/Math.sqrt(values[k]),0))),z=multiply(whiten,y);
    for(let j=0;j<n;j++)this.ps[j]=(1-this.cs)*this.ps[j]+Math.sqrt(this.cs*(2-this.cs)*this.mueff)*z[j];
    this.generation++;const length=Math.hypot(...this.ps),hsig=length/Math.sqrt(1-(1-this.cs)**(2*this.generation))/this.expectedNorm<1.4+2/(n+1);
    for(let j=0;j<n;j++)this.pc[j]=(1-this.cc)*this.pc[j]+Number(hsig)*Math.sqrt(this.cc*(2-this.cc)*this.mueff)*y[j];
    const decay=1-this.c1-this.cmu+Number(!hsig)*this.c1*this.cc*(2-this.cc);
    this.covariance=this.covariance.map((row,i)=>row.map((v,j)=>decay*v+this.c1*this.pc[i]*this.pc[j]+this.cmu*chosen.reduce((sum,c,k)=>sum+this.weights[k]*(c.x[i]-old[i])*(c.x[j]-old[j])/(this.sigma*this.sigma),0)));
    this.sigma*=Math.exp(this.cs/this.damps*(length/this.expectedNorm-1));
    if(!Number.isFinite(this.sigma)||this.sigma<=0||this.mean.some(v=>!Number.isFinite(v)))throw Error('Non-finite CMA state');
    return {sigma:this.sigma,generation:this.generation,bestFitness:chosen[0].fitness};
  }
  static restore(state){const c=new CMA(state.mean,state.sigma,state.population);Object.assign(c,JSON.parse(JSON.stringify(state)));if(c.covariance.length!==c.n||c.covariance.some(row=>row.length!==c.n||row.some(v=>!Number.isFinite(v)))||c.pc.length!==c.n||c.ps.length!==c.n)throw Error('Invalid CMA checkpoint');return c;}
}
module.exports={CMA,eigen,multiply};
