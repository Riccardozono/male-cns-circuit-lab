"""Audit physical candidates against conditional and marginal policy shifts.

Diagnostic only. No new guard is installed and no desired action is inferred.
"""
import os
os.environ['OPENBLAS_NUM_THREADS']='2'
import argparse
import json
from pathlib import Path
import numpy as np
from neuronal_experiment_io import ROOT,atomic_json,file_hash


def scale(features,config):
    w=np.asarray(config['weights']);low=np.log(config['floor']);high=np.log(config['ceiling']);p=(np.log(config['initial'])-low)/(high-low)
    response=features@w[:-2].reshape(64,2)/8+w[-2:]+np.log(p/(1-p))
    return np.exp(low+(high-low)/(1+np.exp(-response)))


def kl(old_mean,old_std,mean,std):
    return (np.log(std/old_std)+(old_std**2+(old_mean-mean)**2)/(2*std**2)-.5).sum(-1)


def run(study,tag):
    if not all(s.replace('-','').isalnum() for s in [study,tag]):raise ValueError('Scoped audit required')
    directory=ROOT/'.impeccable/review/learning-ml'/study;out=directory.parent/tag;out.mkdir(exist_ok=False)
    report_file=directory/'report.json';report=json.loads(report_file.read_text());records=[];maximum_conditional_error=0.
    for event in report['events']:
        episodes=[json.loads((directory/f"update-{event['update']:02}-episode-{j:02}.private.json").read_text()) for j in range(1,9)]
        for candidate in event['candidates']:
            marginal=[];conditional=[];shifts=[]
            for episode in episodes:
                assert candidate['weights'][:72]==episode['behaviorWeights'][:72]
                rows=[r for c in episode['chunks'] for r in c['rows']];features=np.asarray([r['features'] for r in rows]);active=np.asarray([r['active'] for r in rows])
                w=np.asarray(candidate['weights'][72:]);mean=(features@w[:-2].reshape(64,2)/8+w[-2:])*active[:,None]
                std=scale(features,candidate['exploration']);old_mean=np.asarray([r['mean'] for r in rows]);old_std=np.asarray([r['sigma'] for r in rows])
                previous_mean=np.concatenate([mean[:1],mean[:-1]]);previous_std=np.concatenate([std[:1],std[:-1]])
                actions=np.asarray([r['action'] for r in rows]);previous_actions=np.concatenate([actions[:1],actions[:-1]])
                rho=np.full((len(rows),1),episode['exploration']['rho']);rho[0]=0
                cond_mean=mean+rho*std*(previous_actions-previous_mean)/previous_std;cond_std=std*np.sqrt(1-rho*rho)
                conditional.extend(kl(np.asarray([r['conditionalMean'] for r in rows]),np.asarray([r['conditionalStd'] for r in rows]),cond_mean,cond_std)[active])
                marginal.extend(kl(old_mean,old_std,mean,std)[active]);shifts.extend(np.sqrt(((mean-old_mean)/old_std)**2).max(-1)[active])
            conditional_mean=float(np.mean(conditional));maximum_conditional_error=max(maximum_conditional_error,abs(conditional_mean-candidate['screen']['meanGaussianKL']))
            records.append({'update':event['update'],'fraction':candidate['fraction'],'conditionalKL':conditional_mean,'marginalMeanKL':float(np.mean(marginal)),
                            'marginalP95KL':float(np.quantile(marginal,.95)),'maximumMarginalKL':float(np.max(marginal)),
                            'meanShiftInOldSigmaP95':float(np.quantile(shifts,.95)),'physical':candidate.get('aggregate')})
    assert maximum_conditional_error<1e-9
    physical=[r for r in records if r['physical'] is not None];unsafe=[r for r in physical if not r['physical']['allSafe']]
    result={'passed':True,'learningSucceeded':False,'maximumNativeConditionalKLError':maximum_conditional_error,
            'candidates':records,'physicalCandidates':len(physical),'unsafeCandidates':len(unsafe),
            'unsafeWithMarginalKLAbove002':sum(r['marginalMeanKL']>.02 for r in unsafe),
            'physicalWithMarginalKLAbove002':sum(r['marginalMeanKL']>.02 for r in physical),
            'sourceSha256':file_hash(Path(__file__)),'trainingReportSha256':file_hash(report_file),
            'boundary':'Recomputes native conditional KL and contrasts marginal means/variances on recorded histories. AR1 rho0.9 can cancel slowly changing mean shifts in conditional likelihood. This diagnostic does not prove causality, validate a replacement threshold, or improve a lap. No new rejection guard is installed.'}
    atomic_json(out/'report.json',result);(out/'auditor-at-run.py').write_bytes(Path(__file__).read_bytes());print(json.dumps(result),flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--study',required=True);parser.add_argument('--tag',required=True)
    a=parser.parse_args();run(a.study,a.tag)
