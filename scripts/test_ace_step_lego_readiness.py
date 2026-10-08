"""Readiness must reflect a reachable backend, not an installed package."""
import importlib.util
import io
import json
import os
import tempfile
import urllib.error
import urllib.request
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("lego", Path(__file__).with_name("ace-step-lego-sidecar.py"))
lego = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lego)

class ReadinessTests(unittest.TestCase):
    def test_no_backend_is_not_ready(self):
        with patch.object(lego, "MOCK", False), patch.dict(os.environ, {"ACESTEP_API_BASE": ""}):
            self.assertFalse(lego._inference_available())

    def test_unreachable_backend_is_not_ready(self):
        with patch.object(lego, "MOCK", False), patch.dict(os.environ, {"ACESTEP_API_BASE": "http://localhost:8001"}), patch.object(lego, "_http_json", side_effect=OSError("offline")):
            self.assertFalse(lego._inference_available())

    def test_reachable_backend_is_ready(self):
        with patch.object(lego, "MOCK", False), patch.dict(os.environ, {"ACESTEP_API_BASE": "http://localhost:8001"}), patch.object(lego, "_http_json", return_value={"status": "ok"}) as request:
            self.assertTrue(lego._inference_available())
            request.assert_called_once_with("GET", "http://localhost:8001/health", timeout=1)

class LegoUploadTests(unittest.TestCase):
    def test_source_audio_is_uploaded_as_multipart(self):
        source_bytes = b"temporary test audio"
        responses = {
            "http://localhost:8001/release_task": b'{"data":{"task_id":"task-1"}}',
            "http://localhost:8001/query_result": json.dumps(
                {"data": [{"status": 1, "result": json.dumps([{"file": "/audio.wav"}])}]}
            ).encode(),
            "http://localhost:8001/audio.wav": b"generated audio",
        }
        requests = []

        class Response:
            def __init__(self, body):
                self.body = body

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self):
                return self.body

        def fake_urlopen(request, timeout=120):
            requests.append(request)
            url = request.full_url if isinstance(request, urllib.request.Request) else request
            return Response(responses[url])

        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "project-mix.wav"
            dest = Path(tmp) / "generated.wav"
            src.write_bytes(source_bytes)
            with patch.object(lego.urllib.request, "urlopen", side_effect=fake_urlopen):
                lego._run_via_acestep_api(
                    "http://localhost:8001", src, dest, "warm bass", "Generate the bass track.", 42
                )

            self.assertEqual(dest.read_bytes(), b"generated audio")
            upload = requests[0]
            self.assertEqual(upload.get_method(), "POST")
            self.assertTrue(upload.get_header("Content-type").startswith("multipart/form-data; boundary="))
            self.assertIn(b'name="src_audio"; filename="source.wav"', upload.data)
            self.assertIn(b'name="task_type"\r\n\r\nlego\r\n', upload.data)
            self.assertIn(b'name="prompt"\r\n\r\nwarm bass\r\n', upload.data)
            self.assertIn(source_bytes, upload.data)
            self.assertNotIn(str(src).encode(), upload.data)

    def test_http_error_includes_server_detail(self):
        error = urllib.error.HTTPError(
            "http://localhost:8001/release_task",
            400,
            "Bad Request",
            {},
            io.BytesIO(b'{"detail":"absolute audio file paths are not allowed"}'),
        )
        with patch.object(lego.urllib.request, "urlopen", side_effect=error):
            with self.assertRaisesRegex(RuntimeError, "absolute audio file paths are not allowed"):
                lego._http_json("GET", "http://localhost:8001/release_task")

installer_spec = importlib.util.spec_from_file_location("installer", Path(__file__).with_name("install-ace-step-lego.py"))
installer = importlib.util.module_from_spec(installer_spec)
installer_spec.loader.exec_module(installer)

class InstallerTests(unittest.TestCase):
    def test_revision_must_be_immutable(self):
        with self.assertRaises(ValueError):
            installer.source_url("main")
        self.assertTrue(installer.source_url("a" * 40).endswith("a" * 40))

    def test_sync_preserves_upstream_sources_and_lock(self):
        command = installer.sync_command("python", "source")
        for flag in ["--project", "--active", "--locked", "--no-python-downloads"]:
            self.assertIn(flag, command)

if __name__ == "__main__":
    unittest.main()
