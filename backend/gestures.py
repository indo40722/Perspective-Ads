import math


def is_hand_pinched(landmarks, threshold=0.32):
    wrist = landmarks[0]
    middle_finger_base = landmarks[9]
    thumb_tip = landmarks[4]
    index_tip = landmarks[8]

    palm_length = math.hypot(
        middle_finger_base.x - wrist.x,
        middle_finger_base.y - wrist.y,
    )
    if palm_length <= 1e-6:
        return False

    fingertip_distance = math.hypot(
        index_tip.x - thumb_tip.x,
        index_tip.y - thumb_tip.y,
    )
    return fingertip_distance / palm_length <= threshold
