"""Fresh native process: deterministic proof and paired stochastic assessment."""
import os
os.environ['OPENBLAS_NUM_THREADS']='2'
os.environ['OMP_NUM_THREADS']='2'
import argparse
import json
from pathlib import Path
import numpy as np
from neuronal_experiment_io import ROOT, Pipe, atomic_json, file_hash
from train_learned_neural_variance import aggregate, noise_profile


def run(study,tag):
    if not all(s.replace('-','').isalnum() for s in [study,tag]):raise ValueError('Scoped study names required')
    directory=ROOT/'.impeccable/review/learning-ml'/study;out=directory.parent/tag;out.mkdir(exist_ok=False)
    report_file=directory/'report.json';checkpoint_file=directory/'checkpoint.private.json'
    report=json.loads(report_file.read_text());checkpoint=json.loads(checkpoint_file.read_text())
    assert report['passed'] and checkpoint['sourceHashes']==report['sourceHashes']
    assert all(file_hash(ROOT/f)==digest for f,digest in report['sourceHashes'].items())
    assert checkpoint['bestSafe']==report['bestSafe'] and checkpoint['currentGenome']==report['finalResearchGenome']
    assert checkpoint['currentExploration']==report['finalResearchExploration'] and checkpoint['settings']==report['settings']
    env=Pipe(ROOT/'work/recurrent-v3-learned-variance-env.cjs')
    try:
        meta=env.metadata;assert meta['parentSha256']==checkpoint['rootParentSha256'] and meta['rewardRevision']==checkpoint['revision']
        baseline=meta['genome']['policyWeights'];best=report['bestSafe']['weights'];current=report['finalResearchGenome']['policyWeights']
        assert {k:v for k,v in meta['genome'].items() if k!='policyWeights'}=={k:v for k,v in report['finalResearchGenome'].items() if k!='policyWeights'}
        def evaluate(weights,heading):return env.request('evaluate',weights=weights,configuration={'maxTicks':0,'headingOffsetRad':heading})
        training=[]
        for row,old in zip(report['bestSafe']['outcomes'],report['baseline']):
            heading=row['headingOffsetRad'];before=evaluate(baseline,heading);after=evaluate(best,heading);repeat=evaluate(best,heading)
            assert before==old['result'] and after==row['result'] and after==repeat
            training.append({'headingOffsetRad':heading,'before':before,'after':after,'repeatIdentical':True})
            print('LEARNED_VARIANCE_PROOF '+json.dumps({'phase':'training','heading':heading,'after':after}),flush=True)
        held_out={}
        for name in ['validation','test']:
            held_out[name]=[]
            for heading in report['settings'][name+'Offsets']:
                row={'headingOffsetRad':heading,'before':evaluate(baseline,heading),'after':evaluate(best,heading)}
                held_out[name].append(row);print('LEARNED_VARIANCE_PROOF '+json.dumps({'phase':name,**row}),flush=True)
        research=[{'headingOffsetRad':h,'result':evaluate(current,h)} for h in report['settings']['trainingOffsets']]
        configurations=[('parent',baseline,report['settings']['initialExploration']),('bestSafe',best,report['bestSafe']['exploration']),
                        ('researchCurrent',current,report['finalResearchExploration'])]
        cases=[(0,71171,1),(0,71171,-1),(-.004375,71909,1),(.004375,71909,-1)]
        stochastic={}
        for name,weights,exploration in configurations:
            summaries=[]
            for heading,seed,sign in cases:
                env.request('clear')
                episode=env.request('episode',configuration={'weights':weights,'exploration':exploration,'headingOffsetRad':heading,
                    'seed':seed,'sign':sign,'std':exploration['initial'],'safetyCost':2000,'maxTicks':0})
                summary={k:episode[k] for k in ['seed','sign','headingOffsetRad','result','controls','trainingReward','actionTraceSha256']}
                summary['noiseProfile']=noise_profile([episode]);summaries.append(summary)
                print('LEARNED_VARIANCE_PROOF '+json.dumps({'phase':'stochastic','policy':name,'heading':heading,'seed':seed,'sign':sign,'result':episode['result']}),flush=True)
            stochastic[name]={'cases':summaries,'aggregate':aggregate([r['result'] for r in summaries]),
                              'meanTrainingReward':float(np.mean([r['trainingReward'] for r in summaries]))}
        def changed(weights,noise):
            return {'nativeMean202':int(np.sum(np.abs(np.asarray(weights)-baseline)>1e-12)),
                    'variance130':int(np.sum(np.abs(np.asarray(noise['weights']))>1e-12)),
                    'varianceWeightNorm':float(np.linalg.norm(noise['weights']))}
        training_summary=aggregate([r['after'] for r in training]);validation_summary=aggregate([r['after'] for r in held_out['validation']]);test_summary=aggregate([r['after'] for r in held_out['test']])
        learned=all(v['allSafe'] and v['minimumLaps']>=2 for v in [training_summary,validation_summary,test_summary])
        original=Path('C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save')
        assert file_hash(original)==report['originalSaveSha256'] and all(file_hash(ROOT/f)==digest for f,digest in report['sourceHashes'].items())
        result={'format':'private-learned-neural-variance-native-proof-v1','passed':True,'learningSucceeded':learned,'approvedForApp':False,
                'training':training,'trainingAggregate':training_summary,'validation':held_out['validation'],'validationAggregate':validation_summary,
                'test':held_out['test'],'testAggregate':test_summary,'researchCurrent':research,'researchCurrentAggregate':aggregate([r['result'] for r in research]),
                'bestWeightChanges':changed(best,report['bestSafe']['exploration']),'researchWeightChanges':changed(current,report['finalResearchExploration']),
                'stochasticPairedAssessment':stochastic,'sourceHashes':report['sourceHashes'],'trainingReportSha256':file_hash(report_file),
                'checkpointSha256':file_hash(checkpoint_file),'verifierSha256':file_hash(Path(__file__)),'originalSaveSha256':file_hash(original),
                'boundary':'Fresh complete native replays from line, no teacher or route. Four paired stochastic cases per policy are diagnostic, not a general convergence benchmark. Passing verifies outcomes/hashes, not all neural states or optimizer continuation. App integration and ordinary save compatibility remain unapproved.'}
        atomic_json(out/'report.json',result);atomic_json(out/'checkpoint-snapshot.private.json',checkpoint)
        (out/'verifier-at-run.py').write_bytes(Path(__file__).read_bytes())
        print('LEARNED_VARIANCE_PROOF_FINISHED '+json.dumps({'passed':True,'learningSucceeded':learned,'best':training_summary,'test':test_summary,'report':str(out/'report.json')}),flush=True)
    finally:env.close()


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--study',required=True);parser.add_argument('--tag',required=True)
    args=parser.parse_args();run(args.study,args.tag)
