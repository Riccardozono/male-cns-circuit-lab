"""Private actual-reward CUDA TD3; privileged critic, neuronal-only driving.

Several explicit algorithm/profile changes are tested together. This is not an
isolated claim that a particular previous failure was caused by partial state.
"""
import os
os.environ['OMP_NUM_THREADS']='1'
os.environ['OPENBLAS_NUM_THREADS']='1'
os.environ['MKL_NUM_THREADS']='1'
import argparse
import copy
import json
import shutil
import time
import numpy as np
import torch
from stable_baselines3.common.noise import OrnsteinUhlenbeckActionNoise
from stable_baselines3.common.callbacks import BaseCallback
from neuronal_experiment_io import ROOT,NODE,Pipe,file_hash,atomic_json
from neural_asymmetric_policy import AsymmetricTD3Policy,import_actor,numeric_actor
from neural_asymmetric_vec import ActualAsymmetricVec
from neural_warm_td3 import WarmAsymmetricTD3
from neural_transition_dataset import load_episode,complete_returns
from train_neural_command_readout import node,eligible,KEYS


def export(model,file):atomic_json(file,numeric_actor(model))


def prefit_critic(model,dataset,out,updates=2000):
    before=copy.deepcopy(numeric_actor(model));initial_actor_target=copy.deepcopy(model.actor_target.state_dict())
    episodes=[load_episode(record) for record in dataset['records']]
    returns=[complete_returns(data,model.gamma) for data in episodes]
    train=[i for i in range(len(episodes)) if i%4!=3];validation=[i for i in range(len(episodes)) if i%4==3]
    def tensors(indices):
        return tuple(torch.as_tensor(np.concatenate([values(i) for i in indices],axis=0),device=model.device) for values in [lambda i:np.asarray(episodes[i][:,:557]),lambda i:np.asarray(episodes[i][:,557:559]),lambda i:returns[i][:,None]])
    x,a,y=tensors(train);vx,va,vy=tensors(validation)
    def loss(x,a,y):return sum(torch.nn.functional.mse_loss(q,y) for q in model.critic(x,a))
    with torch.no_grad():initial={'trainMSESum':float(loss(x,a,y)),'heldOutEpisodeMSESum':float(loss(vx,va,vy))}
    for group in model.critic.optimizer.param_groups:group['lr']=1e-3
    history=[]
    for step in range(1,updates+1):
        indices=torch.randint(len(x),(256,),device=model.device);objective=loss(x[indices],a[indices],y[indices])
        if not torch.isfinite(objective):raise RuntimeError('Actual-return critic loss became non-finite')
        model.critic.optimizer.zero_grad();objective.backward();model.critic.optimizer.step()
        if step%250==0:
            with torch.no_grad():row={'updates':step,'trainMSESum':float(loss(x,a,y)),'heldOutEpisodeMSESum':float(loss(vx,va,vy))}
            history.append(row);atomic_json(out/'critic-prefit-progress.json',{'phase':'critic-prefit','initial':initial,'history':history});print('ASYMMETRIC_CRITIC_PREFIT '+json.dumps(row),flush=True)
    if numeric_actor(model)!=before or any(not torch.equal(initial_actor_target[k],v) for k,v in model.actor_target.state_dict().items()):raise RuntimeError('Critic preparation must not change the actual driving actor or its target')
    model.critic_target.load_state_dict(model.critic.state_dict())
    for data in episodes:
        for row in data:
            model.replay_buffer.add(row[:557][None,:],row[561:][None,:],row[557:559][None,:],row[559:560],row[560:561],[{'TimeLimit.truncated':False}])
    report={'passed':True,'updates':updates,'initial':initial,'final':history[-1],'history':history,'trainEpisodes':train,'heldOutEpisodes':validation,'trainTransitions':len(x),'heldOutTransitions':len(vx),'actualReplayPrefillTransitions':sum(len(d) for d in episodes),'actorExactlyUnchanged':True,
            'boundary':'Monte Carlo targets are sums of actual recorded discounted rewards until true physical termination, never desired driving controls. Whole episodes are held out during this critic-only fit; they join replay afterward, so this is not a later generalization test or a lap/improvement claim.'}
    atomic_json(out/'critic-prefit.json',report)
    if history[-1]['trainMSESum']>=initial['trainMSESum'] or history[-1]['heldOutEpisodeMSESum']>=initial['heldOutEpisodeMSESum']:raise RuntimeError('Critic preparation did not improve even its actual-return validation; stop before changing the actor')
    return report


class Evaluation(BaseCallback):
    def __init__(self,out,pipe,baseline,interval):
        super().__init__();self.out=out;self.pipe=pipe;self.best=baseline;self.interval=interval;self.last=0;self.evaluations=[];self.best_actor=out/'initial-actor.json';self.started=time.monotonic()
    def _on_step(self):
        if self.num_timesteps-self.last<self.interval:return True
        self.last=self.num_timesteps;file=self.out/f'actor-{self.num_timesteps:07d}.json';export(self.model,file)
        actual=self.pipe.request('evaluate',actorFile=str(file),mode='full');accepted=eligible(actual,self.best)
        if accepted:self.best=actual;self.best_actor=file;self.model.save(self.out/'best-own-model.zip')
        row={'steps':self.num_timesteps,'criticGradientUpdates':self.model._n_updates,'actorGradientUpdates':self.model._n_updates//self.model.policy_delay,'actorSha256':file_hash(file),'nativeFull':actual,'accepted':accepted,'practiceEpisodes':self.training_env.episodes,'bestPracticeProgress':self.training_env.best_practice,'wallSeconds':time.monotonic()-self.started}
        self.evaluations.append(row);self.model.save(self.out/'latest-own-model.zip');atomic_json(self.out/'progress.json',{'phase':'training','pid':os.getpid(),'best':self.best,'bestActor':str(self.best_actor),'evaluations':self.evaluations})
        print('ASYMMETRIC_TD3_PROGRESS '+json.dumps(row),flush=True)
        return not (accepted and actual['result']['laps']==2)


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--tag',default='neuronal-command-3809-asymmetric-td3');parser.add_argument('--steps',type=int,default=20000);parser.add_argument('--eval-every',type=int,default=4000)
    args=parser.parse_args()
    if not args.tag.replace('-','').isalnum() or not 1000<=args.steps<=100000 or args.eval_every<1000:raise ValueError('Bounded isolated actual learning required')
    if not torch.cuda.is_available():raise RuntimeError('Actual CUDA actor/critic required, not a silent CPU fallback')
    base=ROOT/'.impeccable/review/neural-sacl';source_file=base/'neuronal-command-3803-cma-bias/report.json';source=json.loads(source_file.read_text(encoding='utf-8'))
    data_file=base/'neuronal-command-3809-asymmetric-data/report.json';dataset=json.loads(data_file.read_text(encoding='utf-8'))
    if source['phase']!='finished' or not source['passed'] or dataset['phase']!='finished' or not dataset['passed']:raise RuntimeError('Complete source and actual dataset required')
    if file_hash(NODE)!=dataset['identity']['nodeExecutableSha256']:raise RuntimeError('Pinned numerical runtime differs')
    for f,expected in dataset['identity']['sourceHashes'].items():
        if file_hash(ROOT/f)!=expected:raise RuntimeError('Do not change sources belonging to the collected actual data: '+f)
    prepared_file=base/'projected-residual-3803-prepared/prepared.json';prepared=json.loads(prepared_file.read_text(encoding='utf-8'));source_actor_file=source_file.with_name('best-actor.json');source_actor=json.loads(source_actor_file.read_text(encoding='utf-8'))
    out=base/args.tag;out.mkdir(exist_ok=False);atomic_json(out/'state.json',{'pid':os.getpid(),'phase':'initializing','configuration':vars(args)})
    env=pipe=None;started=time.monotonic();torch.set_num_threads(1);torch.backends.cuda.matmul.allow_tf32=False;torch.backends.cudnn.allow_tf32=False
    try:
        env=ActualAsymmetricVec(prepared_file,prepared['normalization']);pipe=Pipe(ROOT/'work/neural-asymmetric-env.cjs',{'configuration':{'preparedFile':str(prepared_file)}})
        if env.metadata_record!=pipe.metadata or pipe.metadata!=dataset['identity']['environment']:raise RuntimeError('Training, actual dataset and independent native evaluator differ')
        noise=OrnsteinUhlenbeckActionNoise(np.zeros(2,dtype=np.float32),np.asarray([.004,.02],dtype=np.float32),theta=.15,dt=.1)
        model=WarmAsymmetricTD3(AsymmetricTD3Policy,env,learning_rate=1e-4,buffer_size=30000,learning_starts=0,batch_size=256,gamma=.999,train_freq=(1,'step'),gradient_steps=1,action_noise=noise,
            policy_delay=2,target_policy_noise=.01,target_noise_clip=.03,policy_kwargs={'net_arch':{'pi':[64,64],'qf':[128,128]}},seed=1510557,device='cuda',verbose=0)
        import_actor(model,source_actor);initial_actor=out/'initial-actor.json';export(model,initial_actor)
        if file_hash(initial_actor)!=file_hash(source_actor_file):raise RuntimeError('Exact existing learned actor required at start')
        full=pipe.request('evaluate',actorFile=str(initial_actor),mode='full');practice=pipe.request('evaluate',actorFile=str(initial_actor),mode='practice')
        if any(not e['complete'] or e['censored'] or e['gasBrakeOverlapSteps'] for e in [full,practice]) or any(full['result'][k]!=source['fullChampion']['result'][k] or practice['result'][k]!=full['result'][k] for k in KEYS) or full['actionTraceSha256']!=source['fullChampion']['actionTraceSha256']:raise RuntimeError('New critic architecture must not change the initial complete actual driving trajectory')
        gpu={'name':torch.cuda.get_device_name(0),'torch':torch.__version__,'cuda':torch.version.cuda,'actorDevice':str(next(model.actor.parameters()).device),'criticDevice':str(next(model.critic.parameters()).device)}
        if any(not gpu[k].startswith('cuda') for k in ['actorDevice','criticDevice']):raise RuntimeError('Actual CUDA computation required')
        files=['work/train_neural_asymmetric_td3.py','work/neural_asymmetric_policy.py','work/neural_asymmetric_vec.py','work/neural_warm_td3.py','work/neural_transition_dataset.py','work/neural-asymmetric-env.cjs','work/neural-training-state.cjs','work/neuronal_experiment_io.py','work/neural-command-env.cjs','work/neural-command-state.cjs','work/neural-command-live.cjs','work/neural-command-residual.cjs','work/neural-projected-residual.cjs','work/neural-command-model.cjs','work/command-model-io.cjs']
        identity={'configuration':vars(args),'pid':os.getpid(),'environment':pipe.metadata,'gpu':gpu,'sourceReportSha256':file_hash(source_file),'dataReportSha256':file_hash(data_file),'nodeExecutableSha256':file_hash(NODE),'sourceHashes':{f:file_hash(ROOT/f) for f in files},
                  'hyperparameters':{'gamma':.999,'actorLearningRate':2e-5,'criticLearningRate':1e-4,'criticPrefitLearningRate':1e-3,'criticPrefitUpdates':2000,'batchSize':256,'bufferSize':30000,'learningStarts':0,'actorDelay':2,'targetPolicyNoise':.01,'targetNoiseClip':.03,'ouSigma':[.004,.02],'ouTheta':.15,'ouDt':.1,'workers':1,'actor':[521,64,64,2],'criticInputs':557,'criticLayers':[128,128],'seed':1510557},
                  'boundary':'New combined experimental TD3 profile, not an isolated causal comparison with SAC. The actor always reads only521neuronal/controller inputs; physical sensors and reward-state metadata exist only in the critic during training. No route, teacher or action imitation.'}
        atomic_json(out/'identity.json',identity);atomic_json(out/'preflight.json',{'passed':True,'initialFull':full,'initialPractice':practice,'sameInitialActorBytes':True,'sameFullNativeTrace':True})
        print('ASYMMETRIC_TD3_READY '+json.dumps({'gpu':gpu,'initialFull':full['result'],'actualDatasetTransitions':dataset['actualTransitions'],'actorInputs':521,'criticInputs':557}),flush=True)
        atomic_json(out/'state.json',{'pid':os.getpid(),'phase':'critic-prefit','identity':identity})
        prefit=prefit_critic(model,dataset,out);model.save(out/'initial-own-model.zip');model.save(out/'best-own-model.zip')
        export(model,out/'after-critic-prefit-actor.json')
        if file_hash(out/'after-critic-prefit-actor.json')!=file_hash(initial_actor):raise RuntimeError('Critic prefit changed initial numeric driving model')
        atomic_json(out/'state.json',{'pid':os.getpid(),'phase':'training','identity':identity,'prefit':prefit})
        callback=Evaluation(out,pipe,full,args.eval_every);model.learn(total_timesteps=args.steps,callback=callback)
        atomic_json(out/'state.json',{'pid':os.getpid(),'phase':'native-validation','actualSteps':model.num_timesteps,'criticGradientUpdates':model._n_updates})
        final_actor=out/'final-actor.json';export(model,final_actor);final=pipe.request('evaluate',actorFile=str(final_actor),mode='full')
        if eligible(final,callback.best):callback.best=final;callback.best_actor=final_actor;model.save(out/'best-own-model.zip')
        model.save(out/'final-own-model.zip');model.save_replay_buffer(out/'own-replay-buffer.pkl')
        repeat=pipe.request('evaluate',actorFile=str(callback.best_actor),mode='full')
        if repeat['censored'] or repeat['actionTraceSha256']!=callback.best['actionTraceSha256'] or any(repeat['result'][k]!=callback.best['result'][k] for k in KEYS):raise RuntimeError('Selected numeric model does not independently repeat')
        best_actor=out/'best-actor.json';shutil.copy2(callback.best_actor,best_actor);numeric_file=out/'model.malecns-neuronal-command.json'
        node({'op':'export','preparedFile':str(prepared_file),'actorFile':str(best_actor),'file':str(numeric_file),'episode':repeat,'provenance':{'trainingIdentitySha256':file_hash(out/'identity.json'),'variant':'asymmetric-td3-neuronal-only-actor','actualSteps':model.num_timesteps,'criticGradientUpdates':model._n_updates,'actorGradientUpdates':model._n_updates//2,'actualCriticPrefitUpdates':prefit['updates'],'actualDatasetTransitions':dataset['actualTransitions'],'gpu':gpu}})
        env.close();pipe.close()
        native=[node({'op':'verify','file':str(numeric_file)}) for _ in range(2)]
        report={'passed':True,'phase':'finished','identity':identity,'initialFull':full,'initialPractice':practice,'criticPrefit':prefit,'actualSteps':model.num_timesteps,'criticGradientUpdates':model._n_updates,'actorGradientUpdates':model._n_updates//2,'practiceEpisodes':env.episodes,'evaluations':callback.evaluations,'best':callback.best,'independentBestRepeat':repeat,'improved':eligible(callback.best,full),'final':final,'nativeVerifications':native,'exportedModelFile':str(numeric_file),'wallSeconds':time.monotonic()-started,
                'boundary':'Actual reward-trained CUDA actor/critic, real CPU graph/vehicle physics and complete from-line numeric native validation. Additional physical observations are critic-only; exported actor strictly521-64-64-2. Source best protected. Practice is not an app generation, Q fit is not driving improvement and0laps remains0laps. Warm-start V3/Monza only; no Windows installation, original save or release changes.'}
        atomic_json(out/'report.json',report);atomic_json(out/'state.json',{'pid':os.getpid(),'phase':'finished','reportSha256':file_hash(out/'report.json')});print('ASYMMETRIC_TD3_DONE '+json.dumps({k:report[k] for k in ['passed','improved','actualSteps','criticGradientUpdates','actorGradientUpdates','practiceEpisodes','best','wallSeconds']}),flush=True)
    except Exception as error:
        atomic_json(out/'state.json',{'pid':os.getpid(),'phase':'failed','error':repr(error),'actualSteps':model.num_timesteps if 'model' in locals() else 0,'criticGradientUpdates':model._n_updates if 'model' in locals() else 0});raise
    finally:
        if env:env.close()
        if pipe:pipe.close()


if __name__=='__main__':main()
