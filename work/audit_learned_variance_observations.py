"""Observed-feature diagnostics; never consumed as a controller or teacher."""
import os
os.environ['OPENBLAS_NUM_THREADS']='2'
import argparse
import json
from pathlib import Path
import numpy as np
from neuronal_experiment_io import ROOT, atomic_json, file_hash


def run(study,tag):
    if not all(s.replace('-','').isalnum() for s in [study,tag]):raise ValueError('Scoped diagnostics required')
    directory=ROOT/'.impeccable/review/learning-ml'/study;out=directory.parent/tag;out.mkdir(exist_ok=False)
    episodes=[json.loads((directory/f'update-01-episode-{j:02}.private.json').read_text()) for j in range(1,9)]
    grad_file=directory/'update-01-gradient.private.json';gradient=json.loads(grad_file.read_text())
    rows=[r for e in episodes for c in e['chunks'] for r in c['rows']]
    features=np.asarray([r['features'] for r in rows]);sensors=np.asarray([r['sensors'] for r in rows])
    centered=features-features.mean(0);singular=np.linalg.svd(centered,compute_uv=False)
    masks={'firstQuarter':[],'lastQuarter':[],'braking':[]}
    for e in episodes:
        erows=[r for c in e['chunks'] for r in c['rows']]
        masks['firstQuarter'] += [j<len(erows)/4 for j in range(len(erows))]
        masks['lastQuarter'] += [j>=len(erows)*.75 for j in range(len(erows))]
        masks['braking'] += [r['mean'][1]<-.06 for r in erows]
    masks={k:np.asarray(v) for k,v in masks.items()}
    config=episodes[0]['exploration'];low=np.log(config['floor']);high=np.log(config['ceiling']);initial=np.log(config['initial'])
    fraction=(initial-low)/(high-low);offset=np.log(fraction/(1-fraction))
    direction=np.asarray(gradient['directions']['joint332'])[202:]
    responses=[]
    for step in [0,.1,.3,1.]:
        weights=np.clip(np.asarray(config['weights'])+step*direction,-8,8)
        response=features@weights[:-2].reshape(64,2)/8+weights[-2:]
        sigma=np.exp(low+(high-low)/(1+np.exp(-response-offset)))
        responses.append({'step':step,'allMeanSigma':sigma.mean(0).tolist(),
                          'groupMeanSigma':{k:sigma[m].mean(0).tolist() if m.any() else None for k,m in masks.items()}})
    result={'passed':True,'learningSucceeded':False,'actualControls':len(rows),'featureColumns':features.shape[1],
            'featureStdMinMedianMax':[float(np.min(features.std(0))),float(np.median(features.std(0))),float(np.max(features.std(0)))],
            'fractionFeatureValuesAboveAbs099':float(np.mean(np.abs(features)>.99)),
            'singularValues':singular.tolist(),'relativeRanks':{str(t):int(np.sum(singular>singular[0]*t)) for t in [1e-2,1e-3,1e-4,1e-6,1e-8]},
            'sensorStdByIndex':sensors.std(0).tolist(),'groups':{k:int(m.sum()) for k,m in masks.items()},
            'fixedHistoryVarianceDirection':responses,'varianceDirectionNorm':float(np.linalg.norm(direction)),
            'gradientFileSha256':file_hash(grad_file),'episodeSha256s':[file_hash(directory/f'update-01-episode-{j:02}.private.json') for j in range(1,9)],
            'boundary':'SVD and projected candidate sigmas on actual recorded features. No new counterfactual physical rollout. Control-index groups are diagnostics only, never gates or controller inputs. Saturation/rank measurements do not alone establish a driving cause.'}
    atomic_json(out/'report.json',result);(out/'auditor-at-run.py').write_bytes(Path(__file__).read_bytes())
    print(json.dumps(result),flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--study',required=True);parser.add_argument('--tag',required=True)
    args=parser.parse_args();run(args.study,args.tag)
