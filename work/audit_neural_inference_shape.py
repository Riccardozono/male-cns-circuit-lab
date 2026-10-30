"""Measure numerical differences on actual observations, without advancing cars."""
import json
import numpy as np
import torch
import neural_sac as NS
from search_neural_memory_feature import SOURCE

def main():
    torch.set_num_threads(1)
    model=NS.GentleWarmSAC.load(SOURCE/'best-own-model.zip',device='cuda')
    trace_file=NS.ROOT/'.impeccable/review/neural-sacl/neural-memory-feature-verified/rewardChampion-trace.json'
    rows=json.loads(trace_file.read_text(encoding='utf-8'));differences=[]
    for row in rows[::10]:
        observation=np.asarray(row['observation'],dtype=np.float32)
        single=model.predict(observation,deterministic=True)[0]
        batch=model.predict(np.stack([observation]*4),deterministic=True)[0][0]
        repeat=model.predict(observation,deterministic=True)[0]
        if not np.array_equal(single,repeat):raise RuntimeError('Single-row inference is unstable')
        differences.append(float(np.max(np.abs(single-batch))))
    report={'passed':True,'samples':len(differences),'maximumSingleBatchDifference':max(differences),
            'nonidenticalSamples':sum(x>0 for x in differences),'singleRowRepeatExact':True,
            'device':str(model.actor.device),'actorSha256':NS.file_hash(SOURCE/'best-own-model.zip'),
            'actualObservationsSha256':NS.file_hash(trace_file),
            'boundary':'Rounding evidence only; no conclusion about a failed episode without replay. Fixed inference shape is used for strict repeat comparisons.'}
    out=NS.ROOT/'.impeccable/review/neural-sacl/inference-shape-audit';out.mkdir(parents=True,exist_ok=False)
    NS.atomic_json(out/'report.json',report);print(json.dumps(report),flush=True)

if __name__=='__main__':main()
