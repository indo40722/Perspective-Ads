import math


def create_far_face_crop(image, width_ratio=0.62, height_ratio=0.68, center_y=0.63):
    frame_height, frame_width = image.shape[:2]
    crop_width = max(1, round(frame_width * width_ratio))
    crop_height = max(1, round(frame_height * height_ratio))
    left = (frame_width - crop_width) // 2
    center_y_px = round(frame_height * center_y)
    top = max(0, min(frame_height - crop_height, center_y_px - crop_height // 2))
    region = (
        left / frame_width,
        top / frame_height,
        crop_width / frame_width,
        crop_height / frame_height,
    )
    return image[top:top + crop_height, left:left + crop_width].copy(), region


def map_landmark_to_frame(landmark, region):
    left, top, width_ratio, height_ratio = region
    return (
        left + float(landmark.x) * width_ratio,
        top + float(landmark.y) * height_ratio,
    )


def estimate_face_scale(landmarks, region_width=1.0, region_height=1.0):
    if not landmarks:
        return 0.0

    xs = [float(landmark.x) for landmark in landmarks]
    ys = [float(landmark.y) for landmark in landmarks]
    width = max(xs) - min(xs)
    height = max(ys) - min(ys)
    if width <= 0 or height <= 0:
        return 0.0

    return math.sqrt(width * region_width * height * region_height)
