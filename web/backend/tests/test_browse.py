import subprocess

import pytest
from fastapi.testclient import TestClient

from app import app
from ea.browse import pick_directory


def test_zenity_directory_preferred():
    recorded = []

    def fake_which(name):
        if name in ("zenity", "kdialog"):
            return f"/usr/bin/{name}"
        return None

    def fake_runner(cmd, **kwargs):
        recorded.append((list(cmd), kwargs))
        return subprocess.CompletedProcess(cmd, 0, "/tmp/logs\n", "")

    result = pick_directory(runner=fake_runner, which=fake_which)

    assert result == "/tmp/logs"
    assert len(recorded) == 1
    cmd, kwargs = recorded[0]
    assert cmd == ["zenity", "--file-selection", "--directory"]
    assert kwargs.get("capture_output") is True
    assert kwargs.get("text") is True
    assert "timeout" not in kwargs


def test_kdialog_fallback():
    recorded = []

    def fake_which(name):
        if name == "kdialog":
            return "/usr/bin/kdialog"
        return None

    def fake_runner(cmd, **kwargs):
        recorded.append(list(cmd))
        return subprocess.CompletedProcess(cmd, 0, "/tmp/logs\n", "")

    result = pick_directory(runner=fake_runner, which=fake_which)

    assert result == "/tmp/logs"
    assert recorded == [["kdialog", "--getexistingdirectory"]]


def test_cancel_returns_none():
    def fake_which(name):
        return "/usr/bin/kdialog"

    def fake_runner(cmd, **kwargs):
        return subprocess.CompletedProcess(cmd, 1, "", "")

    assert pick_directory(runner=fake_runner, which=fake_which) is None


def test_empty_stdout_returns_none():
    def fake_which(name):
        return "/usr/bin/kdialog"

    def fake_runner(cmd, **kwargs):
        return subprocess.CompletedProcess(cmd, 0, "  \n", "")

    assert pick_directory(runner=fake_runner, which=fake_which) is None


def test_no_tools_raises():
    def fake_which(name):
        return None

    with pytest.raises(FileNotFoundError, match="no folder dialog \\(kdialog or zenity\\)"):
        pick_directory(runner=lambda *a, **k: None, which=fake_which)


def test_api_browse_folder_ok(monkeypatch):
    monkeypatch.setattr("app.pick_directory", lambda: "/data/Baseball")
    c = TestClient(app)
    r = c.post("/api/browse-folder")
    assert r.status_code == 200
    assert r.json() == {"path": "/data/Baseball"}


def test_api_browse_folder_no_dialog(monkeypatch):
    def boom():
        raise FileNotFoundError("no folder dialog (kdialog or zenity)")

    monkeypatch.setattr("app.pick_directory", boom)
    c = TestClient(app)
    r = c.post("/api/browse-folder")
    assert r.status_code == 503
    assert r.json()["detail"] == "no folder dialog (kdialog or zenity)"


def test_api_browse_folder_cancel(monkeypatch):
    monkeypatch.setattr("app.pick_directory", lambda: None)
    c = TestClient(app)
    r = c.post("/api/browse-folder")
    assert r.status_code == 200
    assert r.json() == {"path": None}
