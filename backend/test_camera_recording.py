import asyncio
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from fastapi import HTTPException

import main


class FakeRequest:
    def __init__(self, body, origin="http://127.0.0.1:8000"):
        self._body = body
        self.headers = {"origin": origin, "host": "127.0.0.1:8000"}
        self.url = SimpleNamespace(scheme="http")

    async def json(self):
        return self._body


class CameraRecordingTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.previous_recordings_dir = main.recordings_dir
        self.previous_camera_status = main.camera_status
        self.previous_camera_enabled = main.CAMERA_ENABLED
        main.recordings_dir = Path(self.temp_dir.name)
        main.camera_status = "ready"
        main.CAMERA_ENABLED = True
        main.connected_socket_ids.clear()
        main.connected_socket_ids.add("test-socket")
        main.active_camera_recording = None
        main.completed_camera_recordings.clear()
        self.writer = mock.Mock()
        self.writer.isOpened.return_value = True
        self.writer_patch = mock.patch.object(main.cv2, "VideoWriter", return_value=self.writer)
        self.writer_factory = self.writer_patch.start()

    def tearDown(self):
        self.writer_patch.stop()
        main.active_camera_recording = None
        main.completed_camera_recordings.clear()
        main.connected_socket_ids.clear()
        main.recordings_dir = self.previous_recordings_dir
        main.camera_status = self.previous_camera_status
        main.CAMERA_ENABLED = self.previous_camera_enabled
        self.temp_dir.cleanup()

    def test_camera_recording_starts_stops_and_can_be_discarded(self):
        request = FakeRequest({"socket_id": "test-socket"})

        started = asyncio.run(main.start_camera_recording(request))
        self.assertEqual(main.active_camera_recording["recording_id"], started["recording_id"])

        stopped = asyncio.run(main.finish_camera_recording(started["recording_id"], request))
        self.assertEqual(stopped["filename"], started["filename"])
        self.writer.release.assert_called_once()
        self.assertIn(started["recording_id"], main.completed_camera_recordings)

        main.cancel_camera_recording("test-socket")
        self.assertEqual(main.completed_camera_recordings, {})

    def test_camera_recording_rejects_a_different_origin(self):
        request = FakeRequest({"socket_id": "test-socket"}, origin="http://other.example")

        with self.assertRaises(HTTPException) as error:
            asyncio.run(main.start_camera_recording(request))

        self.assertEqual(error.exception.status_code, 403)
        self.writer_factory.assert_not_called()

    def test_socket_disconnect_discards_an_unfinished_recording(self):
        request = FakeRequest({"socket_id": "test-socket"})
        started = asyncio.run(main.start_camera_recording(request))
        recording_path = main.active_camera_recording["path"]

        main.cancel_camera_recording("test-socket")

        self.writer.release.assert_called_once()
        self.assertIsNone(main.active_camera_recording)
        self.assertFalse(recording_path.exists())
        self.assertNotIn(started["recording_id"], main.completed_camera_recordings)


if __name__ == "__main__":
    unittest.main()
