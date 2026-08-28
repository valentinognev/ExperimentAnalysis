import subprocess

import pytest
from fastapi.testclient import TestClient

from app import app
from ea.browse import pick_file, start_dir


def test_zenity_file_preferred():
    recorded = []

    def fake_which(name):
        if name in ("zenity", "kdialog"):
            return f"/usr/bin/{name}"
        return None

    def fake_runner(cmd, **kwargs):
        recorded.append((list(cmd), kwargs))
        return subprocess.CompletedProcess(cmd, 0, "/tmp/d2.ulg\n", "")

    result = pick_file(runner=fake_runner, which=fake_which)

    assert result == "/tmp/d2.ulg"
    assert len(recorded) == 1
    cmd, kwargs = recorded[0]
    assert cmd == ["zenity", "--file-selection"]
    assert "--directory" not in cmd
    assert kwargs.get("capture_output") is True
    assert kwargs.get("text") is True
    assert "timeout" not in kwargs


def test_start_dir_file_uses_parent(tmp_path):
    f = tmp_path / "d2.ulg"
    f.write_bytes(b"x")
    assert start_dir(str(f)) == str(tmp_path)


def test_start_dir_directory_uses_itself(tmp_path):
    assert start_dir(str(tmp_path)) == str(tmp_path)


def test_start_dir_missing_file_uses_existing_parent(tmp_path):
    missing = tmp_path / "gone.ulg"
    assert start_dir(str(missing)) == str(tmp_path)


def test_start_dir_empty_or_missing_parent_is_none(tmp_path):
    assert start_dir(None) is None
    assert start_dir("") is None
    assert start_dir("   ") is None
    assert start_dir(str(tmp_path / "no-such-dir" / "gone.ulg")) is None


def test_zenity_filename_starts_in_folder(tmp_path):
    recorded = []
    folder = tmp_path / "Baseball"
    folder.mkdir()
    ulg = folder / "d2.ulg"
    ulg.write_bytes(b"x")

    def fake_which(name):
        return "/usr/bin/zenity" if name == "zenity" else None

    def fake_runner(cmd, **kwargs):
        recorded.append(list(cmd))
        return subprocess.CompletedProcess(cmd, 0, str(ulg) + "\n", "")

    pick_file(runner=fake_runner, which=fake_which, start=str(ulg))

    assert recorded == [["zenity", "--file-selection", f"--filename={folder}/"]]


def test_kdialog_start_dir(tmp_path):
    recorded = []
    folder = tmp_path / "Baseball"
    folder.mkdir()

    def fake_which(name):
        return "/usr/bin/kdialog" if name == "kdialog" else None

    def fake_runner(cmd, **kwargs):
        recorded.append(list(cmd))
        return subprocess.CompletedProcess(cmd, 0, str(folder / "d2.ulg") + "\n", "")

    pick_file(runner=fake_runner, which=fake_which, start=str(folder / "d2.ulg"))

    assert recorded == [["kdialog", "--getopenfilename", str(folder)]]


def test_kdialog_fallback():
    recorded = []

    def fake_which(name):
        if name == "kdialog":
            return "/usr/bin/kdialog"
        return None

    def fake_runner(cmd, **kwargs):
        recorded.append(list(cmd))
        return subprocess.CompletedProcess(cmd, 0, "/tmp/d2.ulg\n", "")

    result = pick_file(runner=fake_runner, which=fake_which)

    assert result == "/tmp/d2.ulg"
    assert recorded == [["kdialog", "--getopenfilename"]]


def test_cancel_returns_none():
    def fake_which(name):
        return "/usr/bin/kdialog"

    def fake_runner(cmd, **kwargs):
        return subprocess.CompletedProcess(cmd, 1, "", "")

    assert pick_file(runner=fake_runner, which=fake_which) is None


def test_empty_stdout_returns_none():
    def fake_which(name):
        return "/usr/bin/kdialog"

    def fake_runner(cmd, **kwargs):
        return subprocess.CompletedProcess(cmd, 0, "  \n", "")

    assert pick_file(runner=fake_runner, which=fake_which) is None


def test_no_tools_raises():
    def fake_which(name):
        return None

    with pytest.raises(FileNotFoundError, match="no file dialog \\(kdialog or zenity\\)"):
        pick_file(runner=lambda *a, **k: None, which=fake_which)


def test_api_browse_file_ok(monkeypatch):
    monkeypatch.setattr("app.pick_file", lambda start=None: "/data/d2.ulg")
    c = TestClient(app)
    r = c.post("/api/browse-file")
    assert r.status_code == 200
    assert r.json() == {"path": "/data/d2.ulg"}


def test_api_browse_file_passes_start(monkeypatch, tmp_path):
    seen = {}

    def fake_pick(start=None):
        seen["start"] = start
        return "/data/d2.ulg"

    monkeypatch.setattr("app.pick_file", fake_pick)
    c = TestClient(app)
    r = c.post("/api/browse-file", json={"start": "/tmp/d2.ulg"})
    assert r.status_code == 200
    assert seen["start"] == "/tmp/d2.ulg"


def test_api_browse_file_no_dialog(monkeypatch):
    def boom(start=None):
        raise FileNotFoundError("no file dialog (kdialog or zenity)")

    monkeypatch.setattr("app.pick_file", boom)
    c = TestClient(app)
    r = c.post("/api/browse-file")
    assert r.status_code == 503
    assert r.json()["detail"] == "no file dialog (kdialog or zenity)"


def test_api_browse_file_cancel(monkeypatch):
    monkeypatch.setattr("app.pick_file", lambda start=None: None)
    c = TestClient(app)
    r = c.post("/api/browse-file")
    assert r.status_code == 200
    assert r.json() == {"path": None}
