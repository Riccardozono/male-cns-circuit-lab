import unittest
import numpy as np
from train_bilateral_readout import parameters,residual

class MotorReadoutTests(unittest.TestCase):
    def test_transfer_has_zero_extra_steering(self):
        p=parameters([0,0,0,0]);self.assertEqual(p,{'bias':.2,'priorLongWeight':0.,'width':.04,'steeringBias':0.})
        obs=np.zeros(516);steer,longitudinal=residual(obs,p)
        self.assertEqual(steer,0);self.assertAlmostEqual(longitudinal,float(np.tanh(.2)),places=15)

    def test_only_neural_memory_and_prior_motor_output_are_read(self):
        p=parameters([1,-1,1,1]);obs=np.zeros(516)
        before=residual(obs,p);obs[:512]=np.linspace(-1,1,512);obs[514]=.8
        self.assertEqual(residual(obs,p),before)
        obs[515]=.9;self.assertNotEqual(residual(obs,p),before)

    def test_residual_is_bounded_and_decays_away_from_its_neural_context(self):
        p=parameters([1e4,-1e4,1e4,1e4]);obs=np.ones(516)
        for v in residual(obs,p):self.assertTrue(np.isfinite(v));self.assertLessEqual(abs(v),1)
        p=parameters([0,0,0,1]);near=residual(np.zeros(516),p)
        for v in residual(obs,p):self.assertLess(abs(v),max(abs(x) for x in near))

if __name__=='__main__':unittest.main()
