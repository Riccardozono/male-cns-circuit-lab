"""Choose bounded exploration using actual continuation outcomes, not labels."""
import argparse
import copy
import json
from pathlib import Path
import numpy as np
from neuronal_experiment_io import ROOT,Pipe,atomic_json,file_hash


def run(tag):
    if not tag.replace('-','').isalnum():raise ValueError('Scoped calibration required')
    out=ROOT/'.impeccable/review/learning-ml'/tag;out.mkdir(exist_ok=False);env=None
    try:
        env=Pipe(ROOT/'work/statehead-reward-env.cjs');meta=env.metadata;atomic_json(out/'metadata.private.json',meta)
        levels=[]
        for name,sigma in [('narrow',[.0005,.005]),('wide',[.005,.04])]:
            cfg={**meta['defaultExploration'],'initial':sigma,'weights':[0.]*20};cases=[]
            for lane,mode in enumerate(['observed-7800','observed-8200']):
                for sign in [1,-1]:
                    env.request('clear');e=env.request('episode',configuration={'weights':meta['weights'],'exploration':cfg,'resetMode':mode,'seed':91261025+lane*104729,'sign':sign})
                    atomic_json(out/f'{name}-{mode}-{sign}.private.json',e)
                    baseline_delta=meta['originalExpected']['bestProgress']-e['start']['progress']
                    cases.append({'resetMode':mode,'sign':sign,'result':e['result'],'safe':e['safe'],'controls':e['controls'],
                                  'progressAfterReset':e['progressAfterReset'],'progressRatioToOwnBaseline':e['progressAfterReset']/baseline_delta,'trainingReward':e['trainingReward']})
                    print('STATEHEAD_CALIBRATION '+json.dumps({'level':name,**cases[-1]}),flush=True)
            level={'name':name,'exploration':cfg,'cases':cases,'safeCount':sum(c['safe'] for c in cases),
                   'medianProgressRatio':float(np.median([c['progressRatioToOwnBaseline'] for c in cases]))};levels.append(level)
        eligible=[l for l in levels if l['safeCount']>=3 and l['medianProgressRatio']>=.8]
        selected=eligible[-1] if eligible else max(levels,key=lambda l:(l['safeCount'],l['medianProgressRatio']))
        full=[]
        for sign in [1,-1]:
            env.request('clear');e=env.request('episode',configuration={'weights':meta['weights'],'exploration':selected['exploration'],'resetMode':'from-line','seed':91261129,'sign':sign})
            atomic_json(out/f'selected-full-{sign}.private.json',e);full.append({k:e[k] for k in ['fullFromLine','controls','result','safe','trainingReward','newLaps','progressAfterReset']})
            print('STATEHEAD_CALIBRATION '+json.dumps({'phase':'selected-full','sign':sign,**full[-1]}),flush=True)
        result={'format':'private-statehead-exploration-calibration-v1','passed':True,'learningSucceeded':False,'levels':levels,'selected':selected,
                'selectedFromLineCases':full,'parentSha256':meta['parentSha256'],'sourceSha256':file_hash(Path(__file__)),
                'boundary':'Own real-prefix resets compare only additional physical motion. Select widest of two predefined noises meeting3/4safe and median80percent own continuation, otherwise best safety/ratio. Full exploratory laps are reported separately, not evidence of a learned deterministic policy.'}
        atomic_json(out/'report.json',result);atomic_json(out/'selected-exploration.private.json',selected['exploration'])
        (out/'calibrator-at-run.py').write_bytes(Path(__file__).read_bytes());print('STATEHEAD_CALIBRATION_FINISHED '+json.dumps({'selected':selected['name'],'full':full}),flush=True)
    except BaseException as error:atomic_json(out/'failure.json',{'error':repr(error)});raise
    finally:
        if env:env.close()


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--tag',required=True);a=p.parse_args();run(a.tag)
