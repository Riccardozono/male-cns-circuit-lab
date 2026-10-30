"""Checks numerical transport boundaries; no fabricated training examples."""
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from types import SimpleNamespace
import numpy as np
import torch
from neuronal_experiment_io import ROOT, NODE
from train_projected_residual_sac import encode, export_actor, improves


class ResidualTests(unittest.TestCase):
    def test_float32_normalization_matches_native_codec_and_export_is_numeric(self):
        prepared = json.loads((ROOT / '.impeccable/review/neural-sacl/projected-residual-3803-prepared/prepared.json').read_text(encoding='utf-8'))
        # Test fixture only, never supplied to an optimizer/replay buffer.
        raw = np.linspace(-1, 1, 521)
        mean = np.asarray(prepared['normalization']['mean'], dtype=np.float32)
        deviation = np.asarray(prepared['normalization']['deviation'], dtype=np.float32)
        actor = SimpleNamespace(latent_pi=torch.nn.Sequential(torch.nn.Linear(521,64),torch.nn.ReLU(),torch.nn.Linear(64,64),torch.nn.ReLU()),mu=torch.nn.Linear(64,2))
        with torch.no_grad():
            actor.mu.weight.zero_()
            actor.mu.bias.zero_()
        with tempfile.TemporaryDirectory(prefix='male-cns-codec-') as directory:
            actor_file = Path(directory) / 'own-actor.json'
            export_actor(SimpleNamespace(actor=actor), actor_file)
            code = "const R=require('./work/neural-projected-residual.cjs'),fs=require('node:fs'),c=JSON.parse(fs.readFileSync(0,'utf8'));const a=JSON.parse(fs.readFileSync(c.actor,'utf8'));R.validateActor(a);console.log(JSON.stringify({input:R.normalize(c.raw,c.normalization),action:R.forward(a,R.normalize(c.raw,c.normalization))}));"
            result = subprocess.run([str(NODE), '-e', code],input=json.dumps({'actor': str(actor_file),'raw': raw.tolist(),'normalization': prepared['normalization']}),cwd=ROOT,capture_output=True,text=True,check=True,creationflags=subprocess.CREATE_NO_WINDOW)
            native = json.loads(result.stdout)
            np.testing.assert_array_equal(encode(raw,mean,deviation),np.asarray(native['input'],dtype=np.float32))
            self.assertEqual(native['action'],[0,0])

    def test_no_censored_unsafe_or_roundoff_only_candidate_is_promoted(self):
        original={'censored':False,'complete':True,'gasBrakeOverlapSteps':0,'result':{'reason':'troppo lenta / senza progresso','fitness':-604.2101103672617,'bestProgress':3803.0701231225135,'laps':0}}
        def trial(**fields):
            return {**original,'result':{**original['result'],**fields}}
        self.assertFalse(improves(original,original))
        self.assertFalse(improves(trial(fitness=original['result']['fitness']+1e-12),original))
        self.assertFalse(improves({**trial(fitness=0,bestProgress=4000),'censored':True},original))
        self.assertFalse(improves(trial(fitness=0,bestProgress=4000,reason='fuori pista'),original))
        self.assertFalse(improves(trial(fitness=0,bestProgress=3000),original))
        self.assertTrue(improves(trial(fitness=-500,bestProgress=3900),original))


if __name__=='__main__':
    unittest.main()
