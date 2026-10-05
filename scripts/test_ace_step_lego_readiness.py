"""Readiness must reflect a reachable backend, not an installed package."""
import importlib.util
import os
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

if __name__ == "__main__":
    unittest.main()
