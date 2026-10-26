import unittest
from types import SimpleNamespace

from gestures import is_hand_pinched


def make_landmarks(thumb_tip, index_tip, middle_finger_base=(0.5, 0.5)):
    landmarks = [SimpleNamespace(x=0.5, y=0.8) for _ in range(21)]
    landmarks[0] = SimpleNamespace(x=0.5, y=0.9)
    landmarks[9] = SimpleNamespace(x=middle_finger_base[0], y=middle_finger_base[1])
    landmarks[4] = SimpleNamespace(x=thumb_tip[0], y=thumb_tip[1])
    landmarks[8] = SimpleNamespace(x=index_tip[0], y=index_tip[1])
    return landmarks


class PinchGestureTests(unittest.TestCase):
    def test_close_thumb_and_index_tips_are_a_pinch(self):
        landmarks = make_landmarks((0.48, 0.58), (0.49, 0.57))

        self.assertTrue(is_hand_pinched(landmarks))

    def test_separated_thumb_and_index_tips_are_not_a_pinch(self):
        landmarks = make_landmarks((0.2, 0.55), (0.8, 0.55))

        self.assertFalse(is_hand_pinched(landmarks))

    def test_degenerate_palm_measurement_is_not_a_pinch(self):
        landmarks = make_landmarks((0.5, 0.5), (0.5, 0.5), middle_finger_base=(0.5, 0.9))

        self.assertFalse(is_hand_pinched(landmarks))


if __name__ == "__main__":
    unittest.main()
