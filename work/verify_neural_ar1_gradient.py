"""Verify conditional AR1 gradients on real captured neural chunks, no driving."""
import json
import subprocess
from pathlib import Path
import numpy as np
from neuronal_experiment_io import ROOT, NODE, atomic_json, file_hash
from recurrent_v3_policy_gradient import gradient

directory = ROOT/'.impeccable/review/learning-ml/v3-neural-ar1-late-exploration-20261024-01'
meta = json.loads((directory/'metadata.private.json').read_text())
episode = json.loads((directory/'episode-2.private.json').read_text())
selected = [episode['chunks'][0], episode['chunks'][-3], episode['chunks'][-1]]
mini = {**episode, 'chunks': selected}
count = sum(len(c['rows']) for c in selected)
g, metrics = gradient(meta, [mini], [1.]*count, device='cuda:0', estimate_fisher=True)
fisher = np.array(metrics.pop('chunkEmpiricalFisher'))
assert np.linalg.eigvalsh(fisher).min() > -max(1., np.linalg.norm(fisher))*1e-12
code = r"""
const fs=require('fs'),F=require('./outputs/simulation.js'),P=require('./work/physical-rollout-pool.cjs'),E=require('./work/recurrent-v3-reward-env.cjs'),X=require('./work/neural-exploration-ar1.cjs');
const dir='.impeccable/review/learning-ml/v3-neural-ar1-late-exploration-20261024-01',m=JSON.parse(fs.readFileSync(dir+'/metadata.private.json')),e=JSON.parse(fs.readFileSync(dir+'/episode-2.private.json')),
 cs=[e.chunks[0],e.chunks.at(-3),e.chunks.at(-1)],sim=P.setup(),count=cs.reduce((s,c)=>s+c.rows.length,0);
function objective(index,delta){const genome=F.cloneGenome(m.genome);genome.policyWeights[index]+=delta;let total=0;
 for(const c of cs){const brain=F.makeBrain(sim.graph);brain.activity.set(c.initialActivity);let prev=c.previousPolicyState;
  for(const row of c.rows){F.neuralStep(sim.graph,brain,genome,row.sensors,true,true);const mean=E.latent(sim.graph,brain,genome).mean,sigma=X.scale(brain.policyFeatures,e.exploration).sigma,
   cond=X.conditional(mean,sigma,prev,e.exploration.rho);if(row.active)total+=X.logp(row.action,cond.mean,cond.std);prev={mean,sigma,action:row.action};}}
 return total/count;}
const checks=[0,10,28,39,72,73,126,198,200,201].map(index=>{const epsilon=1e-7;return {index,epsilon,numeric:(objective(index,epsilon)-objective(index,-epsilon))/(2*epsilon)};});
process.stdout.write(JSON.stringify(checks));
"""
checks = json.loads(subprocess.check_output([str(NODE), '-e', code], cwd=ROOT, text=True, creationflags=subprocess.CREATE_NO_WINDOW))
for row in checks:
    row['analytic'] = float(g[row['index']])
    row['error'] = abs(row['analytic']-row['numeric'])
    row['tolerance'] = 2e-4+abs(row['numeric'])*2e-5
    assert row['error'] <= row['tolerance'], row
out = ROOT/'.impeccable/review/learning-ml/v3-neural-ar1-gradient-preflight-20261024-01'
out.mkdir(exist_ok=False)
report = {'passed': True, 'learningSucceeded': False, 'actualCapturedControls': count, 'chunkStarts': [c['startControl'] for c in selected],
          'metrics': metrics, 'nativeFiniteDifferences': checks, 'fisherShape': list(fisher.shape),
          'inputSha256': file_hash(directory/'episode-2.private.json'), 'sourceSha256': file_hash(Path(__file__)),
          'boundary': 'Numerical likelihood objective on three real fixed-sensor chunks with native initial activity and previous latent-action state. Includes derivatives of neural-conditioned variance and AR1 means. Tests non-quantized sensor/motor coefficients; shared-gain casts retain the previously documented STE approximation. No reward update, physical counterfactual or learned lap.'}
atomic_json(out/'report.json', report)
(out/'verifier-at-run.py').write_bytes(Path(__file__).read_bytes())
print(json.dumps(report))
