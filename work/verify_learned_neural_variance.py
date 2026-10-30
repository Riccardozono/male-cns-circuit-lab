"""Real-trajectory CUDA/native preflight; no claim of learned driving."""
import os
os.environ['OPENBLAS_NUM_THREADS']='2'
os.environ['OMP_NUM_THREADS']='2'
import argparse
import json
import subprocess
from pathlib import Path
import numpy as np
import torch
from neuronal_experiment_io import ROOT, NODE, Pipe, atomic_json, file_hash
from recurrent_v3_learned_variance_gradient import gradient


def run(tag):
    if not tag.replace('-','').isalnum():
        raise ValueError('Scoped tag required')
    out=ROOT/'.impeccable/review/learning-ml'/tag
    out.mkdir(exist_ok=False)
    config={'format':'learned-neural-log-sigma-v1','rho':.9,'floor':[.0001,.005],'ceiling':[.08,.5],
            'initial':[.0015,.04],'weights':[.02*np.sin(j*1.7) for j in range(130)]}
    env=Pipe(ROOT/'work/recurrent-v3-learned-variance-env.cjs')
    try:
        meta=env.metadata
        before=env.request('evaluate',weights=meta['genome']['policyWeights'],configuration={'maxTicks':0})
        zero=env.request('episode',configuration={'std':[0,0],'maxTicks':0})
        assert before==zero['result'] and before=={k:meta['expected'][k] for k in before}
        env.request('clear')
        episode=env.request('episode',configuration={'exploration':config,'seed':20261025,'std':config['initial'],
                                                   'safetyCost':2000,'headingOffsetRad':-.0025,'maxTicks':0})
        atomic_json(out/'metadata.private.json',meta)
        atomic_json(out/'episode.private.json',episode)
        selected=[episode['chunks'][0],episode['chunks'][-3],episode['chunks'][-1]]
        mini={**episode,'chunks':selected}; count=sum(len(c['rows']) for c in selected)
        torch.cuda.init()
        torch.cuda.reset_peak_memory_stats(0)
        gpu,metrics=gradient(meta,[mini],[1.]*count,config,device='cuda:0')
        fisher=np.asarray(metrics.pop('chunkEmpiricalFisher'))
        cpu,cpu_metrics=gradient(meta,[mini],[1.]*count,config,device='cpu',estimate_fisher=False)
        cpu_error=float(np.max(np.abs(gpu-cpu)))
        assert cpu_error <= 1e-10*(1+float(np.max(np.abs(cpu))))
        assert np.linalg.eigvalsh(fisher).min() >= -max(1.,np.linalg.norm(fisher))*1e-12
        metrics.update({'gpuName':torch.cuda.get_device_name(0),'maximumAllocatedBytes':torch.cuda.max_memory_allocated(0)})
        code=r"""
const fs=require('fs'),F=require('./.impeccable/experimental-progress-continuity-20261024/outputs/simulation.js'),P=require('./work/physical-rollout-pool.cjs'),E=require('./work/recurrent-v3-learned-variance-env.cjs'),X=require('./work/learned-neural-exploration.cjs');
const dir=process.argv[1],m=JSON.parse(fs.readFileSync(dir+'/metadata.private.json')),e=JSON.parse(fs.readFileSync(dir+'/episode.private.json')),
 cs=[e.chunks[0],e.chunks.at(-3),e.chunks.at(-1)],sim=P.setup(),count=cs.reduce((s,c)=>s+c.rows.length,0),p=m.genome.policyWeights.length;
function objective(index,delta){const genome=F.cloneGenome(m.genome),config=structuredClone(e.exploration);if(index<p)genome.policyWeights[index]+=delta;else config.weights[index-p]+=delta;let total=0;
 for(const c of cs){const brain=F.makeBrain(sim.graph);brain.activity.set(c.initialActivity);let previous=c.previousPolicyState;
  for(const row of c.rows){F.neuralStep(sim.graph,brain,genome,row.sensors,true,true);const mean=E.latent(sim.graph,brain,genome).mean,sigma=X.scale(brain.policyFeatures,config).sigma,
   d=X.conditional(mean,sigma,previous,config.rho);if(row.active)total+=X.logp(row.action,d.mean,d.std);previous={mean,sigma,action:row.action};}}
 return total/count;}
const checks=[0,28,72,200,201,202,203,250,330,331].map(index=>{const epsilon=1e-6;return {index,epsilon,numeric:(objective(index,epsilon)-objective(index,-epsilon))/(2*epsilon)};});
const zeroConfig=X.create(64),sigmaIdentity=X.scale(Array(64).fill(.2),zeroConfig).sigma.map((v,a)=>Math.abs(v-zeroConfig.initial[a]));
const rejected=[];for(const corrupt of [{...zeroConfig,rho:1},{...zeroConfig,weights:[0]},{...zeroConfig,initial:[0,.04]}]){try{X.validate(corrupt,64);rejected.push(false);}catch{rejected.push(true);}}
process.stdout.write(JSON.stringify({checks,sigmaIdentity,rejected}));
"""
        native=json.loads(subprocess.check_output([str(NODE),'-e',code,str(out)],cwd=ROOT,text=True,creationflags=subprocess.CREATE_NO_WINDOW))
        assert max(native['sigmaIdentity']) < 1e-14 and all(native['rejected'])
        for check in native['checks']:
            check.update({'analytic':float(gpu[check['index']]),'error':abs(float(gpu[check['index']])-check['numeric']),
                          'tolerance':2e-4+abs(check['numeric'])*2e-5})
            assert check['error'] <= check['tolerance'],check
        initial_screen=env.request('rescore',weights=meta['genome']['policyWeights'],advantages=[1.]*episode['controls'],configuration={'exploration':config})
        changed_config={**config,'weights':config['weights'][:]};changed_config['weights'][-1]+=.2
        changed_screen=env.request('rescore',weights=meta['genome']['policyWeights'],advantages=[1.]*episode['controls'],configuration={'exploration':changed_config})
        assert initial_screen['meanGaussianKL']==0 and changed_screen['meanGaussianKL']>0
        report={'passed':True,'learningSucceeded':False,'actualCapturedControls':count,'fullEpisodeControls':episode['controls'],
                'initialDeterministicIdentity':before==zero['result'],'metrics':metrics,'cpuGpuGradientMaxError':cpu_error,
                'nativeFiniteDifferences':native['checks'],'initialSigmaErrors':native['sigmaIdentity'],'invalidConfigsRejected':native['rejected'],
                'fisherShape':list(fisher.shape),'sourceSha256':file_hash(Path(__file__)),'episodeSha256':file_hash(out/'episode.private.json'),
                'nativeInitialScreen':initial_screen,'nativeChangedVarianceScreen':changed_screen,
                'boundary':'332 coefficients: native202 mean plus130 artificial variance readout coefficients, not added anatomical neurons. Real native chunks and recorded AR1 boundary state. Fixed-sensor numerical objective, not a learned lap. Shared-gain STE and truncated recurrent credit remain approximations.'}
        atomic_json(out/'report.json',report)
        (out/'verifier-at-run.py').write_bytes(Path(__file__).read_bytes())
        print('LEARNED_VARIANCE_PREFLIGHT '+json.dumps(report),flush=True)
    finally:
        env.close()


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--tag',required=True);args=parser.parse_args();run(args.tag)
