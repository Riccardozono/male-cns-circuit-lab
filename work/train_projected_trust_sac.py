"""Controlled real-reward CUDA comparison with actor-update backtracking.

Reuses the frozen numeric environment/codec and orchestration helpers without
editing any source belonging to a completed run or an open Windows app.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import io
import json
import os
import shutil
import time
import zipfile
import torch
import train_projected_residual_sac as Base
from neural_trust_sac import ReplayTrustSAC
from neuronal_experiment_io import ROOT,NODE,Pipe,file_hash,atomic_json


def compare_initial_policy(model,own_reference_zip):
    # This file was produced locally by the preceding run. Never load an
    # arbitrary executable/pickle from the user or the network.
    with zipfile.ZipFile(own_reference_zip) as archive:
        previous=torch.load(io.BytesIO(archive.read('policy.pth')),weights_only=True,map_location='cpu')
    current=model.policy.state_dict()
    if set(previous)!=set(current) or any(not torch.equal(previous[k],current[k].detach().cpu()) for k in previous):
        raise RuntimeError('Initial actor, critic or target critic differs from the reference experiment')
    return {'exactPolicyState':True,'tensors':len(current),'referenceCheckpointSha256':file_hash(own_reference_zip),
            'boundary':'All actual initial actor/critic/target tensors compared, no random draw or state restored from an executable model.'}


class TrustEvaluation(Base.Evaluation):
    def _on_step(self):
        previous=len(self.evaluations)
        keep=super()._on_step()
        if len(self.evaluations)!=previous:
            self.evaluations[-1]['trust']=self.model.trust_summary()
            atomic_json(self.out/'progress.json',{'phase':'training','pid':os.getpid(),'best':self.best,'bestActor':str(self.best_actor),'evaluations':self.evaluations})
        return keep


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--tag',default='projected-residual-3803-sac-trust')
    parser.add_argument('--steps',type=int,default=20000)
    parser.add_argument('--workers',type=int,default=4)
    parser.add_argument('--eval-every',type=int,default=4000)
    parser.add_argument('--trust-budget',type=float,default=.001)
    args=parser.parse_args()
    if not args.tag.replace('-','').isalnum() or not 128<=args.steps<=500000 or not 1<=args.workers<=4 or args.eval_every<128 or not 0<args.trust_budget<=.1:
        raise ValueError('Bounded isolated experiment required')
    if not torch.cuda.is_available():
        raise RuntimeError('Actual CUDA GPU required')
    base=ROOT/'.impeccable/review/neural-sacl'
    reference_dir=base/'projected-residual-3803-sac-bounded'
    reference_file=reference_dir/'report.json'
    reference=json.loads(reference_file.read_text(encoding='utf-8'))
    if not reference['passed'] or reference['phase']!='finished':
        raise RuntimeError('Completed reference required')
    prepared_file=base/'projected-residual-3803-prepared/prepared.json'
    prepared=json.loads(prepared_file.read_text(encoding='utf-8'))
    if file_hash(prepared_file)!=reference['identity']['preparationSha256'] or file_hash(NODE)!=reference['identity']['nodeExecutableSha256']:
        raise RuntimeError('Same preparation and numerical runtime required')
    # A controlled comparison, not a different population or longer budget.
    for field in ['steps','workers','eval_every']:
        if getattr(args,field)!=reference['identity']['configuration'][field]:
            raise RuntimeError('Reference budget/population/evaluation settings must remain identical')
    out=base/args.tag
    out.mkdir(exist_ok=False)
    atomic_json(out/'state.json',{'pid':os.getpid(),'phase':'initializing','configuration':vars(args)})
    torch.set_num_threads(1)
    torch.backends.cuda.matmul.allow_tf32=False
    torch.backends.cudnn.allow_tf32=False
    started=time.monotonic()
    env=pipe=None
    try:
        env=Base.ActualVec(args.workers,prepared_file,prepared['normalization'])
        pipe=Pipe(Base.BRIDGE,{'configuration':{'preparedFile':str(prepared_file)}})
        if pipe.metadata!=env.metadata_record or pipe.metadata!=reference['identity']['environment']:
            raise RuntimeError('Reference neuronal/physical environment differs')
        model=ReplayTrustSAC('MlpPolicy',env,trust_budget=args.trust_budget,learning_rate=1e-4,buffer_size=50000,learning_starts=1000,
            batch_size=256,gamma=.999,train_freq=(1,'step'),gradient_steps=1,ent_coef=.005,
            policy_kwargs={'net_arch':{'pi':[64,64],'qf':[128,128]}},seed=15103803,device='cuda',verbose=0)
        with torch.no_grad():
            model.actor.mu.weight.zero_();model.actor.mu.bias.zero_();model.actor.log_std.weight.zero_()
            model.actor.log_std.bias.copy_(torch.tensor([-3.,-.7],device='cuda'))
        initial_policy=compare_initial_policy(model,reference_dir/'initial-own-residual.zip')
        gpu={'name':torch.cuda.get_device_name(0),'torch':torch.__version__,'cuda':torch.version.cuda,'actorDevice':str(next(model.actor.parameters()).device),'criticDevice':str(next(model.critic.parameters()).device)}
        if any(not gpu[k].startswith('cuda') for k in ['actorDevice','criticDevice']):
            raise RuntimeError('Actor and critic must actually use CUDA')
        initial_actor=out/'initial-actor.json';Base.export_actor(model,initial_actor)
        if file_hash(initial_actor)!=file_hash(reference_dir/'initial-actor.json'):
            raise RuntimeError('Initial exported numeric actor differs')
        full=pipe.request('evaluate',actorFile=str(initial_actor),mode='full')
        practice=pipe.request('evaluate',actorFile=str(initial_actor),mode='practice')
        for episode in [full,practice]:
            if episode['censored'] or episode['gasBrakeOverlapSteps'] or any(episode['result'][k]!=reference['initialFull']['result'][k] for k in Base.KEYS):
                raise RuntimeError('Fresh full/practice source driving differs')
        if full['actionTraceSha256']!=reference['initialFull']['actionTraceSha256']:
            raise RuntimeError('Entire initial native action trace differs')
        reused=json.loads((reference_dir/'preflight.json').read_text(encoding='utf-8'))
        source_files=['work/train_projected_trust_sac.py','work/neural_trust_sac.py','work/train_projected_residual_sac.py','work/neural_sac.py','work/neuronal_experiment_io.py','work/neural-projected-residual-env.cjs','work/neural-projected-residual.cjs','work/neural-projected-residual-model.cjs','work/projected-residual-model-io.cjs']
        identity={'configuration':vars(args),'pid':os.getpid(),'environment':pipe.metadata,'gpu':gpu,'nodeExecutableSha256':file_hash(NODE),'preparationSha256':file_hash(prepared_file),
            'learnedInferenceParameters':37698,'referenceReportSha256':file_hash(reference_file),'initialPolicyComparison':initial_policy,
            'hyperparameters':{'learningRate':1e-4,'bufferSize':50000,'learningStarts':1000,'batchSize':256,'gamma':.999,'gradientStepsPerFourTransitions':1,'entropyCoefficient':.005,'seed':15103803,'actor':[521,64,64,2],'critic':[128,128],'initialLogStd':[-3.,-.7]},
            'controlledChange':'Only reward-SAC actor-update backtracking on actual replay observations. No changed inference, physical gain, input feature, reward or initial tensor.',
            'sourceHashes':{f:file_hash(ROOT/f) for f in source_files}}
        atomic_json(out/'identity.json',identity)
        atomic_json(out/'preflight.json',{'passed':True,'identity':identity,'baseline':full,'practice':practice,'nativeVerifications':reused['nativeVerifications'],
            'verificationReuse':{'sourcePreflightSha256':file_hash(reference_dir/'preflight.json'),'initialActorSha256':file_hash(initial_actor),'identicalEnvironment':True,'initialPolicyState':initial_policy},
            'boundary':'Fresh actual full/practice replay. Two standalone zero-residual native proofs are REUSED from the identical frozen codec/environment/actor, not claimed as new runs.'})
        model.save(out/'initial-own-residual.zip');model.save(out/'best-own-residual.zip')
        print('TRUST_SAC_READY '+json.dumps({'gpu':gpu,'baseline':full['result'],'initialStateExactlyMatchesReference':initial_policy,'trustBudget':args.trust_budget}),flush=True)
        atomic_json(out/'state.json',{'pid':os.getpid(),'phase':'training','identity':identity})
        callback=TrustEvaluation(out,pipe,full,args.eval_every)
        model.learn(total_timesteps=args.steps,callback=callback)
        atomic_json(out/'state.json',{'pid':os.getpid(),'phase':'native-validation','actualSteps':model.num_timesteps,'gradientUpdates':model._n_updates})
        final_actor=out/'final-actor.json';Base.export_actor(model,final_actor)
        final=pipe.request('evaluate',actorFile=str(final_actor),mode='full')
        if Base.improves(final,callback.best):
            callback.best,callback.best_actor=final,final_actor;model.save(out/'best-own-residual.zip')
        model.save(out/'final-own-residual.zip');model.save_replay_buffer(out/'own-replay-buffer.pkl')
        repeat=pipe.request('evaluate',actorFile=str(callback.best_actor),mode='full')
        if repeat['censored'] or repeat['actionTraceSha256']!=callback.best['actionTraceSha256'] or any(repeat['result'][k]!=callback.best['result'][k] for k in Base.KEYS):
            raise RuntimeError('Selected actual numeric policy does not repeat')
        best_actor=out/'best-actor.json';shutil.copy2(callback.best_actor,best_actor)
        numeric_file=out/'model.malecns-neuronal-sac.json'
        Base.node({'op':'export','preparedFile':str(prepared_file),'actorFile':str(best_actor),'file':str(numeric_file),'episode':repeat,
                   'provenance':{'trainingIdentitySha256':file_hash(out/'identity.json'),'actualSteps':model.num_timesteps,'actualGradientUpdates':model._n_updates,'trainingDevice':gpu,'variant':'replay-kl-trust-scope-v1'}})
        with ThreadPoolExecutor(max_workers=2) as pool:
            native=list(pool.map(lambda _:Base.node({'op':'verify','file':str(numeric_file)}),range(2)))
        atomic_json(out/'trust-history.json',model.trust_history)
        report={'passed':True,'phase':'finished','identity':identity,'initialFull':full,'initialPractice':practice,'zeroResidualNativePreflight':reused['nativeVerifications'],
                'best':callback.best,'independentBestRepeat':repeat,'improved':Base.improves(callback.best,full),'final':final,'actualSteps':model.num_timesteps,
                'gradientUpdates':model._n_updates,'practiceEpisodes':env.episodes,'evaluations':callback.evaluations,'trust':model.trust_summary(),
                'nativeVerifications':native,'exportedModelFile':str(numeric_file),'wallSeconds':time.monotonic()-started,
                'boundary':'Controlled warm-start V3/Monza comparison, same actual initial actor/critic/target tensors, neuronal inputs, Node24 inference, physics/rewards and20k-transition budget as the completed SAC reference. Only actor-update stability changes. Practice is not generations. No route/teacher; no app installation, release or all-model convergence claim.'}
        atomic_json(out/'report.json',report)
        atomic_json(out/'state.json',{'pid':os.getpid(),'phase':'finished','reportSha256':file_hash(out/'report.json')})
        print('TRUST_SAC_DONE '+json.dumps({k:report[k] for k in ['passed','improved','actualSteps','gradientUpdates','best','practiceEpisodes','trust','wallSeconds']}),flush=True)
    except Exception as error:
        atomic_json(out/'state.json',{'pid':os.getpid(),'phase':'failed','error':repr(error),'actualSteps':model.num_timesteps if 'model' in locals() else 0,'gradientUpdates':model._n_updates if 'model' in locals() else 0})
        raise
    finally:
        if env:env.close()
        if pipe:pipe.close()


if __name__=='__main__':
    main()
