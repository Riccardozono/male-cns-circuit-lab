import argparse
import json
import torch
import neural_sac as NS

class AuthorityPipe(NS.NodePipe):
    def __init__(self,configuration):
        self.configuration=configuration
        super().__init__()
    def send(self,operation,**fields):
        if operation=='init':fields['authorityConfiguration']=self.configuration
        return super().send(operation,**fields)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--tag',default='authority-comparison');args=parser.parse_args()
    if not args.tag.replace('-','').isalnum():raise ValueError('Invalid tag')
    out=NS.ROOT/'.impeccable/review/neural-sacl'/args.tag;out.mkdir(parents=True,exist_ok=False)
    torch.set_num_threads(1);NS.BRIDGE=NS.ROOT/'work/neural-rl-authority.cjs'
    records=[];best=None
    for source in ['self-experience-first','longitudinal-bias-search']:
        model=NS.GentleWarmSAC.load(NS.ROOT/f'.impeccable/review/neural-sacl/{source}/best-own-model.zip',device='cuda')
        for config in [{'retention':'peak','floor':.5},{'retention':'floor','floor':.25},{'retention':'floor','floor':.5},{'retention':'floor','floor':1}]:
            pipe=AuthorityPipe(config)
            try:
                result=NS.validate(model,pipe,'full')
                row={'source':source,'configuration':config,'result':result};records.append(row)
                if not result['censored'] and (best is None or result['laps']>best['result']['laps'] or result['laps']==best['result']['laps'] and result['bestProgress']>best['result']['bestProgress']):best=row
                print('AUTHORITY_PHYSICAL_COMPARISON '+json.dumps(row),flush=True)
                NS.atomic_json(out/'progress.json',{'records':records,'best':best})
            finally:pipe.close()
    model=NS.GentleWarmSAC.load(NS.ROOT/f".impeccable/review/neural-sacl/{best['source']}/best-own-model.zip",device='cuda')
    pipe=AuthorityPipe(best['configuration'])
    try:
        repeat=NS.validate(model,pipe,'full')
        if any(repeat[k]!=best['result'][k] for k in ['bestProgress','fitness','laps','reason','totalSimulationSeconds']):raise RuntimeError('Authority comparison failed independent full repeat')
        report={'passed':True,'records':records,'best':best,'independentRepeat':repeat,'environment':pipe.metadata,
                'boundary':'Learned actor unchanged; only explicitly versioned motor scaling tested. Activity/decoded memory, not pose/time/route, controls scaling. Steering scaling unchanged. Zero actor preserves previous policy. All outcomes are full independent physical runs; original app/save/release not modified.'}
        NS.atomic_json(out/'report.json',report);print('AUTHORITY_COMPARISON_DONE '+json.dumps({'best':best,'repeat':repeat}),flush=True)
    finally:pipe.close()

if __name__=='__main__':main()
