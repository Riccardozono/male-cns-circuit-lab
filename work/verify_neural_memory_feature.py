"""Independent reward champion and coverage explorer verification, full resets.

Recorded actions are training evidence, never a runtime driving sequence.
"""
import argparse
import json
import numpy as np
import torch
import neural_sac as NS
from search_neural_memory_feature import feature, SOURCE

def replay(model, pipe, parameters):
    state=pipe.request('reset',mode='full'); rows=[]
    while True:
        obs=np.asarray(state['observation'],dtype=np.float32)
        action,_=model.predict(obs,deterministic=True)
        extra=float(np.tanh(parameters['coefficient'])*feature(state['observation'],parameters['width']))
        commands=action.tolist()+[extra]
        before=state['observation']
        state=pipe.request('step',action=commands)
        telemetry=pipe.request('inspect')
        rows.append({'observation':before,'action':commands,'reward':state['reward'],
                     'terminated':state['terminated'],'truncated':state['truncated'],'telemetry':telemetry})
        if state['terminated'] or state['truncated']:
            return {**state['info'],'censored':state['truncated'],'validationMode':'full'},rows

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--tag',default='neural-memory-feature-verified');args=parser.parse_args()
    if not args.tag.replace('-','').isalnum():raise ValueError('Invalid tag')
    out=NS.ROOT/'.impeccable/review/neural-sacl'/args.tag;out.mkdir(parents=True,exist_ok=False)
    source=NS.ROOT/'.impeccable/review/neural-sacl/neural-memory-feature/report.json'
    prior=json.loads(source.read_text(encoding='utf-8'))
    eligible=[r for r in prior['records'] if not r['result']['censored']]
    champion=max(eligible,key=lambda r:(r['result']['laps'],r['result']['fitness']))
    explorer=max(eligible,key=lambda r:(r['result']['laps'],r['result']['bestProgress']))
    torch.set_num_threads(1);NS.BRIDGE=NS.ROOT/'work/neural-rl-additive-diagnostic.cjs'
    model=NS.GentleWarmSAC.load(SOURCE/'best-own-model.zip',device='cuda');pipe=NS.NodePipe();verified={}
    try:
        for name,row in [('rewardChampion',champion),('coverageExplorer',explorer)]:
            parameters={k:row[k] for k in ['coefficient','width']}
            actual,trace=replay(model,pipe,parameters)
            if any(actual[k]!=row['result'][k] for k in ['bestProgress','fitness','laps','reason','totalSimulationSeconds']):
                raise RuntimeError('Independent repeat differs: '+name)
            simultaneous=sum(r['telemetry']['lastCommands'][1]>0 and r['telemetry']['lastCommands'][2]>0 for r in trace)
            if simultaneous:raise RuntimeError('Gas and brake overlap')
            NS.atomic_json(out/(name+'-trace.json'),trace)
            verified[name]={'parameters':parameters,'result':actual,'gasBrakeOverlapSteps':simultaneous}
            print('FEATURE_VERIFIED '+json.dumps({'name':name,**verified[name]}),flush=True)
        report={'passed':True,**verified,'environment':pipe.metadata,
                'sourceReportSha256':NS.file_hash(source),'sourceActorSha256':NS.file_hash(SOURCE/'best-own-model.zip'),
                'sourceCodeSha256':NS.file_hash(__file__),
                'boundary':'Reward champion and distance explorer are distinct. Every validation starts at the line; diagnostic body telemetry never enters the actor. No completed lap yet; private incompatible experiment only.'}
        NS.atomic_json(out/'report.json',report)
        print('FEATURE_VERIFICATION_DONE '+json.dumps({k:v for k,v in report.items() if k!='environment'}),flush=True)
    finally:pipe.close()

if __name__=='__main__':main()
