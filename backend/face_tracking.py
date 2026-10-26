import math


def estimate_face_scale(landmarks):
    if not landmarks:
        return 0.0

    xs = [float(landmark.x) for landmark in landmarks]
    ys = [float(landmark.y) for landmark in landmarks]
    width = max(xs) - min(xs)
    height = max(ys) - min(ys)
    if width <= 0 or height <= 0:
        return 0.0

    return math.sqrt(width * height)
