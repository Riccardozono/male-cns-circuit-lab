"""Recover the failed shape-changing validation without replacing its evidence."""
import json
import torch
import neural_sac as NS
from search_neural_memory_feature import SOURCE
from train_memory_readout import evaluate_batch

def main():
    torch.set_num_threads(1);NS.BRIDGE=NS.ROOT/'work/neural-rl-additive.cjs'
    old_file=NS.ROOT/'.impeccable/review/neural-sacl/memory-readout-cma/progress.json'
    old=json.loads(old_file.read_text(encoding='utf-8'))
    out=NS.ROOT/'.impeccable/review/neural-sacl/memory-readout-shape-verified';out.mkdir(parents=True,exist_ok=False)
    model=NS.GentleWarmSAC.load(SOURCE/'best-own-model.zip',device='cuda');pipe=NS.NodePipe();cases={}
    try:
        for name in ['champion','explorer']:
            expected=old[name]['result'];p=old[name]['parameters']
            a=evaluate_batch(model,[pipe],[p])[0];b=evaluate_batch(model,[pipe],[p])[0]
            if a!=b:raise RuntimeError('Fixed single-row replay is unstable')
            cases[name]={'parameters':p,'oldVariableBatchResult':expected,'fixedSingleRow':a,'independentSingleRowRepeat':b,
                'progressDifference':a['bestProgress']-expected['bestProgress'],'fitnessDifference':a['fitness']-expected['fitness']}
            print('MEMORY_SHAPE_VERIFIED '+json.dumps({'name':name,**cases[name]}),flush=True)
        report={'passed':True,'cases':cases,'environment':pipe.metadata,'oldTrainingReportRemainsUnvalidated':True,
                'oldProgressSha256':NS.file_hash(old_file),'actorSha256':NS.file_hash(SOURCE/'best-own-model.zip'),
                'boundary':'New independent evidence under one fixed CUDA inference shape; failed original training was not rewritten. Distinct reward and coverage candidates, no completed lap.'}
        NS.atomic_json(out/'report.json',report)
    finally:pipe.close()

if __name__=='__main__':main()
