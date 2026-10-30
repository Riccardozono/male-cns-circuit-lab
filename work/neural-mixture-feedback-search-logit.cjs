'use strict';
// Bounded logistic coordinate for the actual 0..1 mixture gate. CMA-ES keeps
// optimizing an unconstrained logit, so distinct proposals do not collapse
// onto the gate's 0/1 clamps. The protected elite remains an exact actual gene.
const {Search:Base}=require('./neural-head-cma-transport.cjs');
const MIX=18,EPS=.001,clip=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
const logit=p=>Math.log(clip(p,EPS,1-EPS)/(1-clip(p,EPS,1-EPS)));
const sigmoid=x=>{const z=clip(x,-8,8);return z>=0?1/(1+Math.exp(-z)):Math.exp(z)/(1+Math.exp(z));};
class Search extends Base{
 constructor(c){
  if(c.mean?.length!==19||c.mean.some(v=>!Number.isFinite(v))||c.population!==16||c.sigma>2)throw Error('Nineteen bounded mixture/readout coefficients required');
  const rawMean=c.mean.slice();rawMean[MIX]=logit(.15);
  super({...c,mean:rawMean});
  this.optimizer.covariance=Array.from({length:19},(_,i)=>Array.from({length:19},(_,j)=>i===j?(i===MIX?4:i%2===0?.0625:1):0));
 }
 ask(elite=null){
  let rawElite=null;
  if(elite!==null){if(!Array.isArray(elite)||elite.length!==19||elite.some(v=>!Number.isFinite(v))||elite[MIX]<0||elite[MIX]>1)throw Error('Actual bounded protected elite required');rawElite=elite.slice();rawElite[MIX]=logit(elite[MIX]);}
  const proposals=super.ask(rawElite);
  return proposals.map((row,i)=>{
   const raw=row.map(v=>clip(v,-8,8));
   if(i===0&&rawElite)raw[MIX]=rawElite[MIX];
   this.pending[i].x=raw.slice();
   const actual=raw.slice();actual[MIX]=sigmoid(raw[MIX]);
   if(i===0&&elite!==null)return elite.slice();
   return actual;
  });
 }
}
if(require.main===module){let search;require('node:readline').createInterface({input:process.stdin,crlfDelay:Infinity}).on('line',line=>{let id=null;try{const m=JSON.parse(line);id=m.id;let result;if(m.op==='init'){if(search)throw Error('Already initialized');search=new Search(m);result={initialized:true,gateParameterization:'logit-to-bounded-0..1',initialActualMean:.15};}else if(!search)throw Error('Initialize first');else if(m.op==='ask')result=search.ask(m.elite??null);else if(m.op==='tell')result=search.tell(m.fitness);else if(m.op==='state')result=search.state();else throw Error('Unsupported operation');process.stdout.write(JSON.stringify({id,result})+'\n');}catch(error){process.stdout.write(JSON.stringify({id,error:error.stack})+'\n');}});}
module.exports={Search,logit,sigmoid};
