import cv2
import mediapipe as mp
import socketio
import uvicorn
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
import threading
import asyncio
import os
import time

# --- 設定 ---
CAMERA_ID = 0  # WebカメラのID
WIDTH, HEIGHT = 640, 480

# --- グローバル変数 (スレッド間共有) ---
latest_data = {
    "x": 0.0,
    "y": 0.0,
    "z": 0.0,
    "detected": False,
    "frame_id": 0,
    "updated_at": 0.0,
}
latest_data_lock = threading.Lock()
camera_stop_event = threading.Event()

# --- FastAPI & Socket.IO セットアップ ---
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')
app = FastAPI()
sio_app = socketio.ASGIApp(sio, app)

# フロントエンドの静的ファイル配信設定
# backend/main.py から見て ../frontend/dist を配信する
frontend_dir = os.path.join(os.path.dirname(__file__), '../frontend/dist')
if os.path.isdir(frontend_dir):
    app.mount("/view", StaticFiles(directory=frontend_dir, html=True), name="view")
    print(f"Frontend mounted at http://localhost:8000/view/")
else:
    print(f"フロントエンドのビルドがありません。先に npm --prefix frontend run build を実行してください: {frontend_dir}")

@app.get("/")
async def root():
    return {"message": "Perspective Ads Backend is running. Go to /view/ to see the frontend."}

@sio.event
async def connect(sid, environ):
    print(f"Client connected: {sid}")

@sio.event
async def disconnect(sid):
    print(f"Client disconnected: {sid}")

# --- カメラ処理関数 (別スレッドで実行) ---
def camera_loop():
    global latest_data

    print("MediaPipeを読み込んでいます...")
    mp_face_mesh = mp.solutions.face_mesh
    face_mesh = mp_face_mesh.FaceMesh(
        max_num_faces=1,
        refine_landmarks=False,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5
    )

    cap = cv2.VideoCapture(CAMERA_ID)
    if not cap.isOpened():
        print("カメラを開けませんでした。")
        return

    cap.set(cv2.CAP_PROP_FRAME_WIDTH, WIDTH)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, HEIGHT)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    print("カメラを起動しました。")

    frame_id = 0
    while not camera_stop_event.is_set():
        success, image = cap.read()
        if not success:
            time.sleep(0.01)
            continue

        image.flags.writeable = False
        image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        results = face_mesh.process(image_rgb)

        detected = bool(results.multi_face_landmarks)
        x = 0.0
        y = 0.0
        z = 0.0
        if detected:
            nose = results.multi_face_landmarks[0].landmark[4]
            x = (nose.x - 0.5) * 2
            y = (nose.y - 0.5) * 2
            z = nose.z

        frame_id += 1
        with latest_data_lock:
            latest_data = {
                "x": x,
                "y": y,
                "z": z,
                "detected": detected,
                "frame_id": frame_id,
                "updated_at": time.monotonic(),
            }

    cap.release()
    face_mesh.close()

# --- ブロードキャストループ (非同期) ---
async def broadcast_loop():
    last_frame_id = 0
    last_detected = False

    while True:
        with latest_data_lock:
            data_to_send = latest_data.copy()

        if data_to_send["frame_id"] != last_frame_id:
            last_frame_id = data_to_send["frame_id"]
            if data_to_send["detected"]:
                await sio.emit('face_data', data_to_send)
                last_detected = True
            elif last_detected:
                await sio.emit('face_lost', {"frame_id": last_frame_id})
                last_detected = False
        elif (
            last_detected
            and data_to_send["detected"]
            and time.monotonic() - data_to_send["updated_at"] > 0.5
        ):
            await sio.emit('face_lost', {"frame_id": last_frame_id})
            last_detected = False

        await asyncio.sleep(0.01)

@app.on_event("startup")
async def startup_event():
    camera_stop_event.clear()
    t = threading.Thread(target=camera_loop, daemon=True)
    t.start()
    asyncio.create_task(broadcast_loop())

@app.on_event("shutdown")
async def shutdown_event():
    camera_stop_event.set()

if __name__ == "__main__":
    uvicorn.run(sio_app, host="0.0.0.0", port=8000)
