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
import uuid
import re
from datetime import datetime
from pathlib import Path
from gestures import is_hand_pinched
from face_tracking import estimate_face_scale
from coupons import CouponStore
from fastapi import HTTPException, Request
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

# --- 設定 ---
CAMERA_ID = 0  # WebカメラのID
WIDTH, HEIGHT = 640, 480
CAMERA_ENABLED = os.getenv("PERSPECTIVE_CAMERA_ENABLED", "1").strip().lower() not in {"0", "false", "no", "off"}

# --- スレッド間で共有する状態 ---
latest_data = {
    "x": 0.0,
    "y": 0.0,
    "z": 0.0,
    "face_scale": 0.0,
    "detected": False,
    "hand_x": 0.0,
    "hand_detected": False,
    "hand_pinched": False,
    "frame_id": 0,
    "updated_at": 0.0,
}
latest_data_lock = threading.Lock()
camera_stop_event = threading.Event()
camera_status = "starting" if CAMERA_ENABLED else "disabled"
camera_recording_lock = threading.Lock()
active_camera_recording = None
completed_camera_recordings = {}
connected_socket_ids = set()
recordings_dir = Path(__file__).resolve().parent / "recordings"
coupon_store = None

# --- FastAPIとSocket.IOの設定 ---
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')
app = FastAPI()
sio_app = socketio.ASGIApp(sio, app)

# フロントエンドの静的ファイルを配信する。
# backend/main.pyから見て../frontend/distを参照する。
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
    connected_socket_ids.add(sid)
    print(f"Client connected: {sid}")
    await sio.emit("camera_status", {"status": camera_status}, to=sid)

@sio.event
async def disconnect(sid):
    connected_socket_ids.discard(sid)
    cancel_camera_recording(sid)
    print(f"Client disconnected: {sid}")


def require_same_origin(request):
    origin = request.headers.get("origin")
    host = request.headers.get("host")
    expected_origin = f"{request.url.scheme}://{host}" if host else ""
    if not origin or origin.rstrip("/") != expected_origin:
        raise HTTPException(status_code=403, detail="同じ画面からの操作だけを受け付けます")


def stop_camera_recording(owner_sid, keep_file):
    global active_camera_recording

    with camera_recording_lock:
        current = active_camera_recording
        if current is None or current["owner_sid"] != owner_sid:
            return None

        current["writer"].release()
        active_camera_recording = None
        if keep_file:
            completed_camera_recordings[current["recording_id"]] = current
        else:
            current["path"].unlink(missing_ok=True)
        return current


def cancel_camera_recording(owner_sid):
    active = stop_camera_recording(owner_sid, keep_file=False)
    if active is not None:
        return

    with camera_recording_lock:
        abandoned = [
            recording_id
            for recording_id, recording in completed_camera_recordings.items()
            if recording["owner_sid"] == owner_sid
        ]
        for recording_id in abandoned:
            recording = completed_camera_recordings.pop(recording_id)
            recording["path"].unlink(missing_ok=True)


@app.post("/api/camera-recording/start")
async def start_camera_recording(request: Request):
    global active_camera_recording

    require_same_origin(request)
    body = await request.json()
    owner_sid = body.get("socket_id") if isinstance(body, dict) else None
    if not owner_sid or owner_sid not in connected_socket_ids:
        raise HTTPException(status_code=409, detail="カメラ接続を確認できません")
    if not CAMERA_ENABLED or camera_status != "ready":
        raise HTTPException(status_code=503, detail="カメラが録画できる状態ではありません")

    with camera_recording_lock:
        if active_camera_recording is not None:
            raise HTTPException(status_code=409, detail="別のカメラ録画が進行中です")

        recording_id = uuid.uuid4().hex
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        filename_base = f"perspective-ads-{timestamp}-{recording_id[:6]}"
        path = recordings_dir / f"{filename_base}-camera.avi"
        recordings_dir.mkdir(parents=True, exist_ok=True)
        writer = cv2.VideoWriter(
            str(path),
            cv2.VideoWriter_fourcc(*"MJPG"),
            15.0,
            (WIDTH, HEIGHT),
        )
        if not writer.isOpened():
            writer.release()
            path.unlink(missing_ok=True)
            raise HTTPException(status_code=500, detail="カメラ映像の保存を開始できません")

        active_camera_recording = {
            "recording_id": recording_id,
            "owner_sid": owner_sid,
            "writer": writer,
            "path": path,
            "filename": path.name,
            "filename_base": filename_base,
        }

    return {
        "recording_id": recording_id,
        "filename": path.name,
        "filename_base": filename_base,
    }


@app.post("/api/camera-recording/{recording_id}/stop")
async def finish_camera_recording(recording_id: str, request: Request):
    require_same_origin(request)
    body = await request.json()
    owner_sid = body.get("socket_id") if isinstance(body, dict) else None
    if not owner_sid or owner_sid not in connected_socket_ids:
        raise HTTPException(status_code=409, detail="カメラ接続を確認できません")

    with camera_recording_lock:
        current = active_camera_recording
        if (
            current is None
            or current["recording_id"] != recording_id
            or current["owner_sid"] != owner_sid
        ):
            raise HTTPException(status_code=404, detail="録画中のカメラ映像がありません")

    stopped = stop_camera_recording(owner_sid, keep_file=True)
    if stopped is None or stopped["recording_id"] != recording_id:
        raise HTTPException(status_code=404, detail="録画中のカメラ映像がありません")
    return {"recording_id": recording_id, "filename": stopped["filename"], "filename_base": stopped["filename_base"]}


@app.post("/api/camera-recording/{recording_id}/download")
async def download_camera_recording(recording_id: str, request: Request):
    require_same_origin(request)
    body = await request.json()
    owner_sid = body.get("socket_id") if isinstance(body, dict) else None
    if not owner_sid or owner_sid not in connected_socket_ids:
        raise HTTPException(status_code=409, detail="カメラ接続を確認できません")

    with camera_recording_lock:
        recording = completed_camera_recordings.get(recording_id)
        if recording is None or recording["owner_sid"] != owner_sid:
            raise HTTPException(status_code=404, detail="保存するカメラ映像がありません")
        completed_camera_recordings.pop(recording_id)

    if not recording["path"].is_file():
        raise HTTPException(status_code=404, detail="録画ファイルが見つかりません")

    def remove_recording_file():
        recording["path"].unlink(missing_ok=True)

    return FileResponse(
        recording["path"],
        media_type="video/x-msvideo",
        filename=recording["filename"],
        background=BackgroundTask(remove_recording_file),
    )


@app.post("/api/camera-recording/{recording_id}/cancel")
async def discard_camera_recording(recording_id: str, request: Request):
    global active_camera_recording

    require_same_origin(request)
    body = await request.json()
    owner_sid = body.get("socket_id") if isinstance(body, dict) else None
    if not owner_sid or owner_sid not in connected_socket_ids:
        raise HTTPException(status_code=409, detail="カメラ接続を確認できません")

    with camera_recording_lock:
        current = active_camera_recording
        if current and current["recording_id"] == recording_id and current["owner_sid"] == owner_sid:
            current["writer"].release()
            current["path"].unlink(missing_ok=True)
            active_camera_recording = None
            return {"ok": True}
        completed = completed_camera_recordings.get(recording_id)
        if completed and completed["owner_sid"] == owner_sid:
            completed_camera_recordings.pop(recording_id)
            completed["path"].unlink(missing_ok=True)
    return {"ok": True}


def get_coupon_store():
    global coupon_store

    if coupon_store is None:
        database_path = os.getenv("PERSPECTIVE_COUPON_DB")
        if not database_path:
            database_path = Path(__file__).resolve().parent / "data" / "coupons.sqlite3"
        coupon_store = CouponStore(database_path)
    return coupon_store


def coupon_response(coupon):
    return {
        "claimId": coupon["claim_id"],
        "campaignId": coupon["campaign_id"],
        "code": coupon["code"],
        "status": coupon["status"],
        "issuedAt": coupon["issued_at"],
        "redeemedAt": coupon["redeemed_at"],
    }


def validate_demo_token(value):
    return isinstance(value, str) and re.fullmatch(r"[a-zA-Z0-9-]{16,64}", value)


@app.post("/api/coupons/visits")
async def record_coupon_visit(request: Request):
    require_same_origin(request)
    body = await request.json()
    campaign_id = body.get("campaignId") if isinstance(body, dict) else None
    visit_id = body.get("visitId") if isinstance(body, dict) else None
    if campaign_id != "steak" or not validate_demo_token(visit_id):
        raise HTTPException(status_code=400, detail="広告の読み取り情報が正しくありません")
    return get_coupon_store().record_visit(visit_id, campaign_id)


@app.post("/api/coupons/claim")
async def claim_demo_coupon(request: Request):
    require_same_origin(request)
    body = await request.json()
    campaign_id = body.get("campaignId") if isinstance(body, dict) else None
    claim_id = body.get("claimId") if isinstance(body, dict) else None
    if campaign_id != "steak" or not validate_demo_token(claim_id):
        raise HTTPException(status_code=400, detail="特典の受取情報が正しくありません")
    try:
        coupon = get_coupon_store().claim(claim_id, campaign_id)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    return coupon_response(coupon)


@app.get("/api/coupons/claim/{claim_id}")
async def get_demo_coupon(claim_id: str):
    if not validate_demo_token(claim_id):
        raise HTTPException(status_code=400, detail="特典の受取情報が正しくありません")
    coupon = get_coupon_store().get_claim(claim_id)
    if coupon is None:
        raise HTTPException(status_code=404, detail="受け取り済みの特典が見つかりません")
    return coupon_response(coupon)


@app.post("/api/coupons/redeem")
async def redeem_demo_coupon(request: Request):
    require_same_origin(request)
    body = await request.json()
    code = body.get("code") if isinstance(body, dict) else None
    if not isinstance(code, str) or not re.fullmatch(r"CHAR-[A-Z0-9-]{8}", code.strip().upper()):
        raise HTTPException(status_code=400, detail="クーポンコードの形式を確認してください")

    result = get_coupon_store().redeem(code)
    if result is None:
        raise HTTPException(status_code=404, detail="このコードは見つかりません")
    coupon, newly_redeemed = result
    if not newly_redeemed:
        raise HTTPException(status_code=409, detail="このクーポンはすでに利用済みです")
    return coupon_response(coupon)


@app.get("/api/coupons/stats")
async def get_coupon_stats():
    return get_coupon_store().stats()

def update_camera_status(status):
    global camera_status

    if camera_status != status:
        camera_status = status
        print(f"カメラ状態: {status}")


def open_camera():
    if os.name == "nt":
        backends = [
            ("DirectShow", cv2.CAP_DSHOW),
            ("Media Foundation", cv2.CAP_MSMF),
        ]
    else:
        backends = [("標準方式", cv2.CAP_ANY)]

    for backend_name, backend in backends:
        cap = cv2.VideoCapture(CAMERA_ID, backend)
        if not cap.isOpened():
            cap.release()
            continue

        cap.set(cv2.CAP_PROP_FRAME_WIDTH, WIDTH)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, HEIGHT)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        success, image = cap.read()
        if success:
            print(f"カメラを起動しました。使用方式: {backend_name}")
            return cap, image
        cap.release()

    return None, None


# --- カメラ処理を別スレッドで実行する ---
def camera_loop():
    global latest_data
    global active_camera_recording

    print("MediaPipeを読み込んでいます...")
    mp_face_mesh = mp.solutions.face_mesh
    mp_hands = mp.solutions.hands
    face_mesh = mp_face_mesh.FaceMesh(
        max_num_faces=1,
        refine_landmarks=False,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5
    )
    hands = mp_hands.Hands(
        max_num_hands=1,
        model_complexity=0,
        min_detection_confidence=0.55,
        min_tracking_confidence=0.5,
    )

    frame_id = 0
    while not camera_stop_event.is_set():
        cap, image = open_camera()
        if cap is None:
            update_camera_status("unavailable")
            time.sleep(2)
            continue

        update_camera_status("ready")
        read_failures = 0
        while not camera_stop_event.is_set():
            if image is None:
                success, image = cap.read()
                if not success:
                    read_failures += 1
                    if read_failures >= 10:
                        update_camera_status("unavailable")
                        break
                    time.sleep(0.01)
                    continue

            read_failures = 0
            with camera_recording_lock:
                if active_camera_recording is not None:
                    try:
                        active_camera_recording["writer"].write(image)
                    except Exception as error:
                        print(f"カメラ録画の保存に失敗しました: {error}")
                        active_camera_recording["writer"].release()
                        active_camera_recording["path"].unlink(missing_ok=True)
                        active_camera_recording = None

            image.flags.writeable = False
            image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            results = face_mesh.process(image_rgb)
            hand_results = hands.process(image_rgb)

            detected = bool(results.multi_face_landmarks)
            x = 0.0
            y = 0.0
            z = 0.0
            face_scale = 0.0
            hand_detected = bool(hand_results.multi_hand_landmarks)
            hand_x = 0.0
            hand_pinched = False
            if detected:
                face_landmarks = results.multi_face_landmarks[0].landmark
                nose = face_landmarks[4]
                x = (nose.x - 0.5) * 2
                y = (nose.y - 0.5) * 2
                z = nose.z
                face_scale = estimate_face_scale(face_landmarks)
            if hand_detected:
                hand_landmarks = hand_results.multi_hand_landmarks[0].landmark
                index_tip = hand_landmarks[8]
                hand_x = index_tip.x
                hand_pinched = is_hand_pinched(hand_landmarks)

            frame_id += 1
            with latest_data_lock:
                latest_data = {
                    "x": x,
                    "y": y,
                    "z": z,
                    "face_scale": face_scale,
                    "detected": detected,
                    "hand_x": hand_x,
                    "hand_detected": hand_detected,
                    "hand_pinched": hand_pinched,
                    "frame_id": frame_id,
                    "updated_at": time.monotonic(),
                }

            image = None

        cap.release()
        if not camera_stop_event.is_set():
            time.sleep(2)
    face_mesh.close()
    hands.close()

# --- 検出データとカメラ状態を配信する ---
async def broadcast_loop():
    last_frame_id = 0
    last_detected = False
    last_camera_status = None

    while True:
        if camera_status != last_camera_status:
            last_camera_status = camera_status
            await sio.emit("camera_status", {"status": camera_status})

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
    if CAMERA_ENABLED:
        camera_stop_event.clear()
        t = threading.Thread(target=camera_loop, daemon=True)
        t.start()
    asyncio.create_task(broadcast_loop())

@app.on_event("shutdown")
async def shutdown_event():
    camera_stop_event.set()

if __name__ == "__main__":
    uvicorn.run(sio_app, host="0.0.0.0", port=8000)
