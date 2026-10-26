import unittest
from types import SimpleNamespace

from face_tracking import estimate_face_scale


class FaceScaleTests(unittest.TestCase):
    def test_face_scale_tracks_uniform_approach(self):
        far_landmarks = [
            SimpleNamespace(x=0.4, y=0.4),
            SimpleNamespace(x=0.6, y=0.6),
        ]
        near_landmarks = [
            SimpleNamespace(x=0.3, y=0.3),
            SimpleNamespace(x=0.7, y=0.7),
        ]

        self.assertAlmostEqual(estimate_face_scale(near_landmarks), estimate_face_scale(far_landmarks) * 2)

    def test_empty_or_degenerate_face_has_no_scale(self):
        self.assertEqual(estimate_face_scale([]), 0.0)
        self.assertEqual(
            estimate_face_scale([SimpleNamespace(x=0.5, y=0.5), SimpleNamespace(x=0.5, y=0.5)]),
            0.0,
        )


if __name__ == "__main__":
    unittest.main()
