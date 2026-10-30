"""Boundary fixtures validate the reader only; they never enter driving or learning."""
import unittest
import numpy as np
from neural_transition_dataset import validate_rows,complete_returns


class DatasetTests(unittest.TestCase):
    def test_complete_reward_returns_and_termination(self):
        data=np.zeros((3,1118),dtype=np.float32);data[:,559]=[1,2,3];data[-1,560]=1
        validate_rows(data);np.testing.assert_array_equal(complete_returns(data,.5),[2.75,3.5,3])
        data[-1,560]=0
        with self.assertRaises(ValueError):complete_returns(data)

    def test_misaligned_or_cross_episode_transitions_fail_closed(self):
        data=np.zeros((3,1118),dtype=np.float32);data[-1,560]=1;data[0,561]=.5
        with self.assertRaises(ValueError):validate_rows(data)
        data[0,561]=0;data[0,560]=1
        with self.assertRaises(ValueError):validate_rows(data)


if __name__=='__main__':unittest.main()
