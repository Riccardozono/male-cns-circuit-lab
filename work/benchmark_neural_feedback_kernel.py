"""Inference-only benchmark on actual observations; no driving conclusions."""
import os
os.environ['OPENBLAS_NUM_THREADS']='2'
os.environ['OMP_NUM_THREADS']='2'
import copy
import json
import time
import torch
from neural_feedback_kernel import KernelActor
from neuronal_experiment_io import ROOT,atomic_json,file_hash


def main():
    torch.set_num_threads(2);torch.set_float32_matmul_precision('highest');torch.manual_seed(100261025)
    source=ROOT/'.impeccable/review/learning-ml/neural-feedback-kernel32-20261025-01'
    out=source.parent/'neural-feedback-kernel-inference-20261025-01';out.mkdir(exist_ok=False)
    sample=torch.load(source/'actual-rollout.private.pt',map_location='cpu',weights_only=True)
    basis=json.loads((source/'basis.private.json').read_text());cpu=KernelActor(basis)
    cpu.load_state_dict(sample['actor'])
    # Nonzero numerical probe weights exercise rounding, not a candidate driver.
    with torch.no_grad():cpu.layers[-1].weight.normal_(0.,.003)
    gpu=copy.deepcopy(cpu).to('cuda:0');x=torch.tensor(sample['batch']['obs'][:256],dtype=torch.float32);gx=x.to('cuda:0')
    def evaluate(model,rows):
        result=[]
        with torch.no_grad():
            for row in rows:result.append(model.deterministic(row[None,:]).cpu())
        return torch.cat(result)
    with torch.no_grad():
        for _ in range(5):cpu.deterministic(x[:1]);gpu.deterministic(gx[:1])
        cuda_batch=gpu.deterministic(gx).cpu();cpu_batch=cpu.deterministic(x)
        start=time.perf_counter();cuda_single=evaluate(gpu,gx);cuda_seconds=time.perf_counter()-start
        start=time.perf_counter();cpu_single=evaluate(cpu,x);cpu_seconds=time.perf_counter()-start
        errors={'cudaSingleVsBatch':float((cuda_single-cuda_batch).abs().max()),'cpuSingleVsBatch':float((cpu_single-cpu_batch).abs().max()),
                'cpuVsCudaSingle':float((cpu_single-cuda_single).abs().max())}
        f=gpu.layers[0](gx);coverage={'zeroSupportedRows':int(((f>0).sum(-1)==0).sum()),'medianActiveFeatures':float((f>0).sum(-1).float().median())}
    report={'format':'private-neural-kernel-inference-probe-v1','passed':True,'learningSucceeded':False,'actualObservationRows':len(x),
            'cpuSingleInferenceSeconds':cpu_seconds,'cudaSingleInferenceSecondsIncludingTransfers':cuda_seconds,'maxMotorResidualErrors':errors,
            'actualRolloutBasisCoverage':coverage,'actualRolloutSha256':file_hash(source/'actual-rollout.private.pt'),
            'sourceSha256':file_hash(__file__),'boundary':'Actual recorded observations with synthetic nonzero numerical-probe coefficients, never training labels. CPU/GPU times are a concurrent local inference microbenchmark, not end-to-end app speed or learning improvement. Any backend change requires actual full-physics replay before use.'}
    atomic_json(out/'report.json',report);print(json.dumps(report),flush=True)


if __name__=='__main__':main()
