import cv2
import mediapipe as mp
import socketio
import uvicorn
from fastapi import FastAPI
import threading
import asyncio
import numpy as np

# --- 設定 ---
CAMERA_ID = 0  # WebカメラのID
WIDTH, HEIGHT = 640, 480

# --- グローバル変数 (スレッド間共有) ---
latest_data = {
    "x": 0.0,
    "y": 0.0,
    "z": 0.0,
    "detected": False
}

# --- FastAPI & Socket.IO セットアップ ---
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')
app = FastAPI()
sio_app = socketio.ASGIApp(sio, app)

@app.get("/")
async def root():
    return {"message": "Perspective Ads Backend is running"}

@sio.event
async def connect(sid, environ):
    print(f"Client connected: {sid}")

@sio.event
async def disconnect(sid):
    print(f"Client disconnected: {sid}")

# --- カメラ処理関数 (別スレッドで実行) ---
def camera_loop():
    global latest_data
    
    print("Loading MediaPipe (first run requires building font cache, please wait 1-2 minutes)...")
    mp_face_mesh = mp.solutions.face_mesh
    face_mesh = mp_face_mesh.FaceMesh(
        max_num_faces=1,
        refine_landmarks=False,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5
    )

    cap = cv2.VideoCapture(CAMERA_ID)
    if not cap.isOpened():
        print("Error: Could not open camera.")
        return

    print("Camera started.")
    
    first_detection = True

    while True:
        success, image = cap.read()
        if not success:
            continue

        image.flags.writeable = False
        image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        results = face_mesh.process(image_rgb)
        
        if results.multi_face_landmarks:
            if first_detection:
                print("Face detected!")
                first_detection = False

            for face_landmarks in results.multi_face_landmarks:
                # 鼻先 (Index 4) を基準にする
                nose = face_landmarks.landmark[4]
                
                # 座標系: 
                # MediaPipe: x(左0->右1), y(上0->下1), z(顔中心0)
                # Three.jsへ送るため正規化: x(-1 ~ 1), y(-1 ~ 1)
                
                nx = (nose.x - 0.5) * 2  
                ny = (nose.y - 0.5) * 2  
                nz = nose.z              
                
                # 更新
                latest_data["x"] = nx
                latest_data["y"] = ny
                latest_data["z"] = nz
                latest_data["detected"] = True
        else:
            latest_data["detected"] = False
            
        # CPU負荷軽減
        # cv2.waitKey(1) 

    cap.release()

# --- ブロードキャストループ (非同期) ---
async def broadcast_loop():
    while True:
        # 最新の座標データを全クライアントに送信
        if latest_data["detected"]:
            # 辞書をコピーして送信（競合回避）
            data_to_send = latest_data.copy()
            await sio.emit('face_data', data_to_send)
        else:
            await sio.emit('face_lost', {})
            
        await asyncio.sleep(0.033) # 約30FPSで送信

@app.on_event("startup")
async def startup_event():
    # カメラ処理スレッド開始
    t = threading.Thread(target=camera_loop, daemon=True)
    t.start()
    
    # データ送信タスク開始
    asyncio.create_task(broadcast_loop())

if __name__ == "__main__":
    uvicorn.run("main:sio_app", host="0.0.0.0", port=8000, reload=True)
