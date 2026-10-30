"""Whiten8unsupervised neural-feature directions; never use action targets."""
import json
import os
os.environ['OMP_NUM_THREADS']='1'
os.environ['OPENBLAS_NUM_THREADS']='1'
import subprocess
import numpy as np
from neuronal_experiment_io import ROOT,NODE,atomic_json,file_hash


def main():
    out=ROOT/'.impeccable/review/neural-sacl/neuronal-command-readout-prepared';out.mkdir(exist_ok=False)
    raw_file=out/'actual-neuronal-latents.json'
    process=subprocess.run([str(NODE),str(ROOT/'work/command-latent-data.cjs'),str(raw_file)],cwd=ROOT,capture_output=True,text=True,encoding='utf-8',timeout=60,creationflags=subprocess.CREATE_NO_WINDOW)
    if process.returncode:raise RuntimeError(process.stderr)
    data=json.loads(raw_file.read_text(encoding='utf-8'));values=np.asarray(data['latents'],dtype=np.float64)
    if values.shape[1]!=64 or len(values)<100 or not np.isfinite(values).all():raise RuntimeError('Actual finite64dimensional neuronal features required')
    mean=values.mean(axis=0);scale=np.maximum(values.std(axis=0),.02)
    _,singular,axes=np.linalg.svd((values-mean)/scale,full_matrices=False)
    if singular[7]<1e-6:raise RuntimeError('Eight genuinely variable neural directions required')
    axes=axes[:8];deviation=np.maximum(singular[:8]/np.sqrt(len(values)),.05)
    prepared={'format':'male-cns-unsupervised-neural-readout-basis','schema':1,'numericRuntime':'24.19.0','dimensions':18,'mean':mean.tolist(),'scale':scale.tolist(),'components':axes.tolist(),'componentStd':deviation.tolist(),
              'samples':len(values),'explainedSampleVariance':float(np.sum(singular[:8]**2)/np.sum(singular**2)),
              'latentDataSha256':file_hash(raw_file),'sourceBodyLayers':data['sourceBodyLayers'],'actualNeuronalSources':data['sources'],
              'sourceHashes':{'work/prepare_command_readout.py':file_hash(__file__),'work/command-latent-data.cjs':file_hash(ROOT/'work/command-latent-data.cjs')},
              'boundary':'18plastic readout coordinates:2bias offsets plus2x8directions derived unsupervised from actual neuronal inputs through the frozen neural encoder. No new biological nodes or target driving actions. Sample variance retention is not driving accuracy or generalization. Numeric actors materialize these coordinates into ordinary final-layer weights; no new inference architecture.'}
    atomic_json(out/'prepared.json',prepared)
    print('NEURONAL_READOUT_PREPARED '+json.dumps({'file':str(out/'prepared.json'),'samples':len(values),'plasticCoordinates':18,'explainedSampleVariance':prepared['explainedSampleVariance']}),flush=True)


if __name__=='__main__':main()
