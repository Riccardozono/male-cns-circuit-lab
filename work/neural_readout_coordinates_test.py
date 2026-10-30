"""Mapping fixtures only; none are driving-action labels/training examples."""
import json
import unittest
import numpy as np
from neuronal_experiment_io import ROOT
from neural_readout_coordinates import materialize


class ReadoutTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        base=ROOT/'.impeccable/review/neural-sacl'
        cls.prepared=json.loads((base/'neuronal-command-readout-prepared/prepared.json').read_text(encoding='utf-8'))
        cls.source=json.loads((base/'neuronal-command-3803-cma-bias/best-actor.json').read_text(encoding='utf-8'))
        cls.actual=json.loads((base/'neuronal-command-readout-prepared/actual-neuronal-latents.json').read_text(encoding='utf-8'))['latents']

    def test_zero_is_exact_and_only_final_readout_changes(self):
        self.assertEqual(materialize(self.source,self.prepared,[0]*18),self.source)
        x=np.zeros(18);x[3]=.01
        actor=materialize(self.source,self.prepared,x)
        self.assertEqual(actor['layers'][:2],self.source['layers'][:2])
        self.assertEqual(actor['layers'][2]['weights'][0],self.source['layers'][2]['weights'][0])
        self.assertEqual(actor['layers'][2]['bias'][0],self.source['layers'][2]['bias'][0])

    def test_materialized_weights_match_coordinate_math_on_actual_neuronal_features(self):
        p=self.prepared;x=np.linspace(-.02,.02,18);actor=materialize(self.source,p,x)
        mean=np.asarray(p['mean']);scale=np.asarray(p['scale']);axes=np.asarray(p['components']);std=np.asarray(p['componentStd'])
        for latent in [self.actual[0],self.actual[500],self.actual[-1]]:
            latent=np.asarray(latent)
            projected=(axes@((latent-mean)/scale))/std
            expected=np.asarray(self.source['layers'][2]['weights'])@latent+np.asarray(self.source['layers'][2]['bias'])+x[:2]*[.2,1.]+(x[2:].reshape(8,2).T*np.asarray([[.2],[1.]]))@projected
            actual=np.asarray(actor['layers'][2]['weights'])@latent+np.asarray(actor['layers'][2]['bias'])
            np.testing.assert_allclose(actual,expected,rtol=1e-5,atol=1e-6)

    def test_wrong_body_shape_or_nonfinite_coordinates_fail_closed(self):
        with self.assertRaises(ValueError):materialize(self.source,self.prepared,[0]*2)
        with self.assertRaises(ValueError):materialize(self.source,self.prepared,[float('nan')]*18)
        changed={**self.prepared,'sourceBodyLayers':[]}
        with self.assertRaises(ValueError):materialize(self.source,changed,[0]*18)


if __name__=='__main__':unittest.main()
