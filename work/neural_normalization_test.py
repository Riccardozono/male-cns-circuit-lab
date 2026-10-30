"""Pure preprocessing fixtures; these rows are never training samples."""
import unittest
import numpy as np
from train_penalty5_normalized_sac import encode, combined

class FrozenFixture:
    def __init__(self):
        self.received=None
    def predict(self,raw,deterministic=True):
        self.received=raw.copy()
        return np.tanh(raw[..., :2]).astype(np.float32),None

class NeuralPreprocessing(unittest.TestCase):
    def test_frozen_branch_receives_raw_neurons_not_normalized_values(self):
        raw=np.linspace(-1,1,516,dtype=np.float32)
        frozen=FrozenFixture()
        result=encode(raw,frozen,np.full(516,.2,dtype=np.float32),np.full(516,.3,dtype=np.float32))
        self.assertEqual(result.shape,(518,))
        np.testing.assert_array_equal(frozen.received,raw)
        np.testing.assert_array_equal(result[-2:],np.tanh(raw[:2]).astype(np.float32))
        self.assertTrue(np.isfinite(result).all())

    def test_batch_and_single_preprocessing_agree(self):
        raw=np.asarray([np.linspace(-1,1,516),np.linspace(1,-1,516)],dtype=np.float32)
        mean=np.zeros(516,dtype=np.float32);deviation=np.full(516,.5,dtype=np.float32)
        batch=encode(raw,FrozenFixture(),mean,deviation)
        np.testing.assert_array_equal(batch[0],encode(raw[0],FrozenFixture(),mean,deviation))
        np.testing.assert_array_equal(batch[1],encode(raw[1],FrozenFixture(),mean,deviation))

    def test_zero_longitudinal_delta_preserves_frozen_actions(self):
        frozen=np.asarray([[.3,-.8],[-.2,.8]],dtype=np.float32)
        np.testing.assert_array_equal(combined(frozen,np.zeros((2,1),dtype=np.float32)),frozen)
        changed=combined(frozen,np.ones((2,1),dtype=np.float32))
        np.testing.assert_array_equal(changed[:,0],frozen[:,0])
        self.assertTrue(np.all(np.abs(changed)<=1))

if __name__=='__main__':
    unittest.main()
