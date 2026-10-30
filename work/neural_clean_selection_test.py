"""Selection arithmetic only: these fixtures never enter learning or driving."""
import unittest
from select_neural_clean_champion import dominates


class SelectionTests(unittest.TestCase):
    def test_score_alone_fewer_metres_or_fewer_laps_cannot_replace_champion(self):
        old={'fitness':4052.108730315078,'bestProgress':6584.838934902363,'laps':1}
        self.assertFalse(dominates({**old,'fitness':5000,'bestProgress':6500},old))
        self.assertFalse(dominates({**old,'fitness':5000,'laps':0},old))
        self.assertFalse(dominates({**old,'fitness':4052.108730315079},old))
        self.assertFalse(dominates(old,old))
        self.assertTrue(dominates({'fitness':4100,'bestProgress':6600,'laps':1},old))


if __name__=='__main__':unittest.main()
