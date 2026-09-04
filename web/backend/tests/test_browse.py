import json
import subprocess

import pytest
from fastapi.testclient import TestClient

from app import app
from ea.browse import (
    load_recents,
    pick_file,
    remember_folder,
    resolve_start_folder,
    resolve_typed_path,
    save_recents,
    start_dir,
)


@pytest.fixture(autouse=True)
def isolated_browse_state(tmp_path, monkeypatch):
    """Every pick_file test gets a tmp recents file and GTK disabled by default.

    Without this, tests would read/write the operator's real
    ~/.local/state/experiment-analysis/browse-recent.json (breaking argv
    assertions) and the default gtk_python() probe would find a real
    system GTK and try to launch a real dialog subprocess.
    """
    recents_path = tmp_path / "browse-recent.json"
    monkeypatch.setenv("EA_BROWSE_RECENT", str(recents_path))
    monkeypatch.setattr("ea.browse.gtk_python", lambda: None)
    yield recents_path


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


# --- recents storage ---


def test_load_recents_missing_is_empty(isolated_browse_state):
    assert load_recents() == []


def test_load_recents_corrupt_is_empty(isolated_browse_state):
    isolated_browse_state.parent.mkdir(parents=True, exist_ok=True)
    isolated_browse_state.write_text("{not json")
    assert load_recents() == []


def test_save_and_load_recents_roundtrip(isolated_browse_state):
    save_recents(["/a", "/b"])
    assert load_recents() == ["/a", "/b"]
    on_disk = json.loads(isolated_browse_state.read_text())
    assert on_disk == {"folders": ["/a", "/b"]}


def test_remember_folder_prepends_dedupes_caps_at_8():
    for i in range(8):
        remember_folder(f"/f{i}")
    # /f0.../f7 front-to-back is /f7,/f6,...,/f0
    assert load_recents() == [f"/f{i}" for i in range(7, -1, -1)]

    # Re-remembering an existing folder moves it to the front, no duplicate.
    remember_folder("/f3")
    assert load_recents() == ["/f3", "/f7", "/f6", "/f5", "/f4", "/f2", "/f1", "/f0"]

    # A 9th distinct folder drops the oldest (now at the back).
    remember_folder("/f8")
    result = load_recents()
    assert len(result) == 8
    assert result[0] == "/f8"
    assert "/f0" not in result


# --- resolve_start_folder ---


def test_resolve_start_folder_prefers_start_over_recents(tmp_path):
    start_folder = tmp_path / "start"
    start_folder.mkdir()
    recent_folder = tmp_path / "recent"
    recent_folder.mkdir()

    result = resolve_start_folder(str(start_folder), recents=[str(recent_folder)])

    assert result == str(start_folder)


def test_resolve_start_folder_uses_first_existing_recent_when_start_empty(tmp_path):
    missing = tmp_path / "gone"
    existing = tmp_path / "here"
    existing.mkdir()

    result = resolve_start_folder(None, recents=[str(missing), str(existing)])

    assert result == str(existing)


# --- resolve_typed_path ---


def test_resolve_typed_path_dir_file_missing(tmp_path):
    d = tmp_path / "adir"
    d.mkdir()
    f = tmp_path / "afile.ulg"
    f.write_bytes(b"x")
    missing = tmp_path / "gone"

    assert resolve_typed_path(str(d)) == ("dir", str(d))
    assert resolve_typed_path(str(f)) == ("file", str(f))
    assert resolve_typed_path(str(missing)) is None


# --- pick_file recents integration ---


def test_pick_file_empty_start_passes_recent_folder_to_zenity(tmp_path):
    folder = tmp_path / "Baseball"
    folder.mkdir()
    remember_folder(str(folder))

    recorded = []

    def fake_which(name):
        return "/usr/bin/zenity" if name == "zenity" else None

    def fake_runner(cmd, **kwargs):
        recorded.append(list(cmd))
        return subprocess.CompletedProcess(cmd, 0, str(folder / "d2.ulg") + "\n", "")

    pick_file(runner=fake_runner, which=fake_which, start=None, gtk_python=None)

    assert recorded == [["zenity", "--file-selection", f"--filename={folder}/"]]


def test_pick_file_success_remembers_parent():
    def fake_which(name):
        return "/usr/bin/zenity" if name == "zenity" else None

    def fake_runner(cmd, **kwargs):
        return subprocess.CompletedProcess(cmd, 0, "/tmp/.../d2.ulg\n", "")

    result = pick_file(runner=fake_runner, which=fake_which, gtk_python=None)

    assert result == "/tmp/.../d2.ulg"
    assert load_recents()[0] == "/tmp/..."


def test_pick_file_prefers_gtk_when_available(tmp_path):
    zenity_recorded = []
    gtk_recorded = []

    def fake_which(name):
        return "/usr/bin/zenity" if name == "zenity" else None

    def fake_runner(cmd, **kwargs):
        zenity_recorded.append(list(cmd))
        return subprocess.CompletedProcess(cmd, 0, "/tmp/d2.ulg\n", "")

    def fake_gtk_python():
        return "/usr/bin/python3"

    def fake_gtk_runner(cmd, **kwargs):
        gtk_recorded.append(list(cmd))
        return subprocess.CompletedProcess(cmd, 0, "/tmp/d2.ulg\n", "")

    result = pick_file(
        runner=fake_runner,
        which=fake_which,
        gtk_python=fake_gtk_python,
        gtk_runner=fake_gtk_runner,
    )

    assert result == "/tmp/d2.ulg"
    assert len(gtk_recorded) == 1
    assert zenity_recorded == []


def test_pick_file_gtk_failure_falls_back_to_zenity():
    zenity_recorded = []

    def fake_which(name):
        return "/usr/bin/zenity" if name == "zenity" else None

    def fake_runner(cmd, **kwargs):
        zenity_recorded.append(list(cmd))
        return subprocess.CompletedProcess(cmd, 0, "/tmp/d2.ulg\n", "")

    def fake_gtk_python():
        return "/usr/bin/python3"

    def fake_gtk_runner(cmd, **kwargs):
        return subprocess.CompletedProcess(cmd, 1, "", "gtk crashed")

    result = pick_file(
        runner=fake_runner,
        which=fake_which,
        gtk_python=fake_gtk_python,
        gtk_runner=fake_gtk_runner,
    )

    assert result == "/tmp/d2.ulg"
    assert len(zenity_recorded) == 1
