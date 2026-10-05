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
