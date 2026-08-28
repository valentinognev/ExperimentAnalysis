"""HTTP API tests for rebuild, pose, series, and topics."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import app
from ea.ulog_min import write_min_ulog


def _min_drone2_messages() -> dict:
    return {
        "vehicle_status": [
            {"timestamp": 1000, "arming_state": 1},
            {"timestamp": 5000, "arming_state": 2},
        ],
        "vehicle_local_position": [
            {"timestamp": 5000, "x": 0.0, "y": 0.0, "z": 0.0},
            {"timestamp": 15000, "x": 1.0, "y": 0.0, "z": 0.0},
        ],
        "vehicle_attitude": [
            {"timestamp": 5000, "q[0]": 1.0, "q[1]": 0.0, "q[2]": 0.0, "q[3]": 0.0},
            {"timestamp": 15000, "q[0]": 1.0, "q[1]": 0.0, "q[2]": 0.0, "q[3]": 0.0},
        ],
    }


def _setup_experiment_with_ulog(tmp_path, monkeypatch) -> TestClient:
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    c = TestClient(app)
    r = c.post("/api/experiments", json={"name": "PoseTest"})
    assert r.status_code == 200
    slug = r.json()["slug"]

    ulg = tmp_path / "Group3RLcat2_log_1.ulg"
    write_min_ulog(ulg, _min_drone2_messages())

    r = c.post(f"/api/experiments/{slug}/import", json={"paths": [str(ulg)]})
    assert r.status_code == 200

    r = c.post(f"/api/experiments/{slug}/rebuild")
    assert r.status_code == 200

    return c, slug


def test_rebuild_pose_present_at_t0(tmp_path, monkeypatch):
    c, slug = _setup_experiment_with_ulog(tmp_path, monkeypatch)

    r = c.get(f"/api/experiments/{slug}/pose", params={"t": 0})
    assert r.status_code == 200
    data = r.json()
    assert data["t"] == 0.0
    assert data["drones"]["2"]["present"] is True


def test_unknown_slug_404(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    c = TestClient(app)

    for path in (
        "/api/experiments/nope/pose",
        "/api/experiments/nope/trajectory",
        "/api/experiments/nope/rebuild",
        "/api/experiments/nope/series",
        "/api/experiments/nope/topics",
    ):
        if "series" in path:
            r = c.get(path, params={"channels": "2.ulog.vehicle_local_position.x"})
        elif "pose" in path:
            r = c.get(path, params={"t": 0})
        elif "rebuild" in path:
            r = c.post(path)
        else:
            r = c.get(path)
        assert r.status_code == 404
        assert r.json()["detail"] == "experiment not found"


def test_trajectory_after_rebuild(tmp_path, monkeypatch):
    c, slug = _setup_experiment_with_ulog(tmp_path, monkeypatch)

    r = c.get(f"/api/experiments/{slug}/trajectory")
    assert r.status_code == 200
    ekf = r.json()["drones"]["2"]["ekf_ned"]
    assert len(ekf["t"]) >= 2
    assert ekf["t"][0] == pytest.approx(0.0, abs=1e-6)
    assert "e" in ekf and "n" in ekf and "u" in ekf


def test_series_local_position_x_after_rebuild(tmp_path, monkeypatch):
    c, slug = _setup_experiment_with_ulog(tmp_path, monkeypatch)

    channel = "2.ulog.vehicle_local_position.x"
    r = c.get(
        f"/api/experiments/{slug}/series",
        params={"channels": channel},
    )
    assert r.status_code == 200
    ch = r.json()[channel]
    assert ch["t"][0] == pytest.approx(0.0, abs=1e-6)


def test_topics_tree_after_rebuild(tmp_path, monkeypatch):
    c, slug = _setup_experiment_with_ulog(tmp_path, monkeypatch)

    r = c.get(f"/api/experiments/{slug}/topics")
    assert r.status_code == 200
    tree = r.json()
    assert "2" in tree
    assert "ulog" in tree["2"]
    assert "vehicle_local_position" in tree["2"]["ulog"]
    assert "x" in tree["2"]["ulog"]["vehicle_local_position"]
