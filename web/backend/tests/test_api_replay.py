import time

import pytest
from fastapi.testclient import TestClient

from app import app
from ea.manifest import load_manifest, save_manifest
from ea.replay.replay_job import (
    get_job,
    reset_jobs,
    testing_put_running,
    testing_set_busy,
)
from ea.store import create_experiment, set_drone_count
from ea.ulog_min import write_min_ulog


@pytest.fixture(autouse=True)
def _reset():
    reset_jobs()
    yield
    reset_jobs()


def _min_ulog(path):
    write_min_ulog(
        path,
        {
            "vehicle_local_position": [
                {"timestamp": 0, "x": 0.0, "y": 0.0, "z": 0.0}
            ]
        },
    )


def _exp_with_ulog(tmp_path, monkeypatch, slug="ReplayApi"):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    create_experiment(slug)
    set_drone_count(slug, 2)
    dest_dir = tmp_path / slug / "raw" / "drone_2"
    dest_dir.mkdir(parents=True, exist_ok=True)
    ulg = dest_dir / "flight.ulg"
    _min_ulog(ulg)
    manifest_path = tmp_path / slug / "manifest.json"
    manifest = load_manifest(manifest_path)
    for drone in manifest["drones"]:
        if drone["id"] == 2:
            drone["sources"]["ulg"] = ["raw/drone_2/flight.ulg"]
    save_manifest(manifest_path, manifest)
    return slug


def _add_replay_drone(tmp_path, slug):
    manifest_path = tmp_path / slug / "manifest.json"
    manifest = load_manifest(manifest_path)
    manifest["drones"].append(
        {
            "id": "2_r1",
            "kind": "replay",
            "parent_id": 2,
            "replay_index": 1,
            "label": "D2_r1",
            "sources": {"ulg": []},
        }
    )
    manifest["ui"]["visible_drone_ids"] = [2, "2_r1"]
    save_manifest(manifest_path, manifest)
    (tmp_path / slug / "raw" / "drone_2_r1").mkdir(parents=True, exist_ok=True)


def test_inspect_200_returns_run_id(tmp_path, monkeypatch):
    slug = _exp_with_ulog(tmp_path, monkeypatch)
    c = TestClient(app)
    r = c.post(f"/api/experiments/{slug}/replay/inspect", json={"drone_id": 2})
    assert r.status_code == 200
    body = r.json()
    assert "run_id" in body
    assert len(body["run_id"]) == 12
    staged = tmp_path / slug / "replay" / "work" / body["run_id"] / "input.ulg"
    assert staged.is_file()


def test_inspect_replay_id_400(tmp_path, monkeypatch):
    slug = _exp_with_ulog(tmp_path, monkeypatch)
    c = TestClient(app)
    r = c.post(
        f"/api/experiments/{slug}/replay/inspect", json={"drone_id": "2_r1"}
    )
    assert r.status_code == 400


def test_inspect_unknown_slug_404(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    c = TestClient(app)
    r = c.post(
        "/api/experiments/nope/replay/inspect", json={"drone_id": 2}
    )
    assert r.status_code == 404
    assert r.json()["detail"] == "experiment not found"


def test_inspect_missing_ulog_400(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    create_experiment("NoUlg")
    set_drone_count("NoUlg", 2)
    c = TestClient(app)
    r = c.post("/api/experiments/NoUlg/replay/inspect", json={"drone_id": 2})
    assert r.status_code == 400


def test_post_replay_200(tmp_path, monkeypatch):
    slug = _exp_with_ulog(tmp_path, monkeypatch)
    run_id = "abc123abc123"
    work = tmp_path / slug / "replay" / "work" / run_id
    work.mkdir(parents=True)
    (work / "input.ulg").write_bytes(b"x")
    called = {}

    def fake_start(rid, overrides, **kw):
        called["run_id"] = rid
        called["overrides"] = overrides
        called["kw"] = kw

    monkeypatch.setattr("app.start_replay", fake_start, raising=False)
    c = TestClient(app)
    r = c.post(
        f"/api/experiments/{slug}/replay",
        json={"run_id": run_id, "drone_id": 2, "overrides": {"EKF2_A": 1}},
    )
    assert r.status_code == 200
    assert r.json() == {"ok": True, "run_id": run_id}
    deadline = time.time() + 2
    while time.time() < deadline and "run_id" not in called:
        time.sleep(0.01)
    assert called["run_id"] == run_id
    assert called["overrides"] == {"EKF2_A": 1}
    assert called["kw"]["claimed"] is True
    assert called["kw"]["slug"] == slug
    assert called["kw"]["parent_id"] == 2


def test_post_replay_409_when_busy(tmp_path, monkeypatch):
    slug = _exp_with_ulog(tmp_path, monkeypatch)
    testing_set_busy(True)
    c = TestClient(app)
    r = c.post(
        f"/api/experiments/{slug}/replay",
        json={"run_id": "x", "drone_id": 2, "overrides": {}},
    )
    assert r.status_code == 409
    assert r.json()["detail"] == "replay already running"


def test_get_job_and_stop(tmp_path, monkeypatch):
    slug = _exp_with_ulog(tmp_path, monkeypatch)
    testing_put_running("r1")
    c = TestClient(app)
    r = c.get(f"/api/experiments/{slug}/replay/r1")
    assert r.status_code == 200
    assert r.json()["status"] == "running"
    s = c.post(f"/api/experiments/{slug}/replay/r1/stop")
    assert s.status_code == 200
    assert s.json() == {"ok": True}
    assert get_job("r1")["status"] == "failed"


def test_get_stop_series_unknown_run_id_404(tmp_path, monkeypatch):
    slug = _exp_with_ulog(tmp_path, monkeypatch)
    c = TestClient(app)
    g = c.get(f"/api/experiments/{slug}/replay/nope")
    assert g.status_code == 404
    assert g.json()["detail"] == "replay job not found"
    s = c.post(f"/api/experiments/{slug}/replay/nope/stop")
    assert s.status_code == 404
    assert s.json()["detail"] == "replay job not found"
    ser = c.get(f"/api/experiments/{slug}/replay/nope/series")
    assert ser.status_code == 404
    assert ser.json()["detail"] == "replay job not found"


def test_series_overlay(tmp_path, monkeypatch):
    slug = _exp_with_ulog(tmp_path, monkeypatch)
    run_id = "r1"
    work = tmp_path / slug / "replay" / "work" / run_id
    work.mkdir(parents=True)
    rec_o = {
        "vehicle_local_position": [
            {"timestamp": 1_000_000, "x": 1.0, "y": 0.0, "z": 0.0}
        ],
        "vehicle_attitude": [
            {
                "timestamp": 1_000_000,
                "q[0]": 1.0,
                "q[1]": 0.0,
                "q[2]": 0.0,
                "q[3]": 0.0,
            }
        ],
    }
    rec_r = {
        "vehicle_local_position": [
            {"timestamp": 1_000_000, "x": 2.0, "y": 0.0, "z": 0.0}
        ],
        "vehicle_attitude": [
            {
                "timestamp": 1_000_000,
                "q[0]": 0.9,
                "q[1]": 0.0,
                "q[2]": 0.0,
                "q[3]": 0.0,
            }
        ],
    }
    write_min_ulog(work / "input.ulg", rec_o)
    replayed = tmp_path / "replayed.ulg"
    write_min_ulog(replayed, rec_r)
    testing_put_running(run_id)
    get_job(run_id)["replayed_ulg"] = str(replayed)
    c = TestClient(app)
    r = c.get(f"/api/experiments/{slug}/replay/{run_id}/series")
    assert r.status_code == 200
    data = r.json()
    assert data["vehicle_local_position"]["x"]["original"] == [1.0]
    assert data["vehicle_local_position"]["x"]["replayed"] == [2.0]


def test_delete_replay_drone_200(tmp_path, monkeypatch):
    slug = _exp_with_ulog(tmp_path, monkeypatch)
    _add_replay_drone(tmp_path, slug)
    c = TestClient(app)
    r = c.delete(f"/api/experiments/{slug}/drones/2_r1")
    assert r.status_code == 200
    ids = [d["id"] for d in r.json()["manifest"]["drones"]]
    assert "2_r1" not in ids
    assert 2 in ids
    assert not (tmp_path / slug / "raw" / "drone_2_r1").exists()


def test_delete_physical_drone_400(tmp_path, monkeypatch):
    slug = _exp_with_ulog(tmp_path, monkeypatch)
    c = TestClient(app)
    r = c.delete(f"/api/experiments/{slug}/drones/2")
    assert r.status_code == 400


def test_delete_unknown_slug_404(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    c = TestClient(app)
    r = c.delete("/api/experiments/nope/drones/2_r1")
    assert r.status_code == 404
    assert r.json()["detail"] == "experiment not found"


def test_import_replay_id_400(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    c = TestClient(app)
    c.post("/api/experiments", json={"name": "ImpReplay"})
    r = c.post(
        "/api/experiments/ImpReplay/import",
        json={"paths": ["/tmp"], "drone_id": "2_r1"},
    )
    assert r.status_code == 400
