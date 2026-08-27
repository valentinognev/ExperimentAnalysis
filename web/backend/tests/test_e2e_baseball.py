from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import app

BASEBALL = Path("/home/valentin/RL/TESTFLIGHTS/Baseball")
ULGS = {
    2: "Group3RLcat2_log_41_2026-8-25-17-05-30.ulg",
    3: "Group3RLcat3_log_18_2026-8-25-17-05-26.ulg",
    4: "Group3RLcat4_log_28_2026-8-25-17-05-24.ulg",
}


@pytest.mark.e2e
def test_baseball_dir_present():
    assert BASEBALL.is_dir(), f"missing {BASEBALL}"
    for name in ULGS.values():
        p = BASEBALL / name
        assert p.is_file() and p.stat().st_size > 1_000_000, p


@pytest.mark.e2e
def test_baseball_import_rebuild_pose(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    c = TestClient(app)
    r = c.post("/api/experiments", json={"name": "Baseball"})
    assert r.status_code == 200
    r = c.post("/api/experiments/Baseball/import", json={"paths": [str(BASEBALL)]})
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body.get("needs_id") in (None, [])
    root = tmp_path / "Baseball"
    for i in (2, 3, 4):
        assert list((root / "raw" / f"drone_{i}").glob("*.ulg"))
    r = c.post("/api/experiments/Baseball/rebuild")
    assert r.status_code == 200
    r = c.get("/api/experiments/Baseball")
    man = r.json()["manifest"]
    ids = sorted(d["id"] for d in man["drones"])
    assert ids == [2, 3, 4]
    d3 = next(d for d in man["drones"] if d["id"] == 3)
    assert not (d3.get("ssh") or {}).get("host")
    d2 = next(d for d in man["drones"] if d["id"] == 2)
    assert d2["ssh"]["host"] == "192.168.31.30"
    d4 = next(d for d in man["drones"] if d["id"] == 4)
    assert d4["ssh"]["host"] == "192.168.31.152"
    r = c.get("/api/experiments/Baseball/pose", params={"t": 0})
    assert r.status_code == 200
    pose = r.json()
    assert "origin" in pose
    for i in ("2", "3", "4"):
        dr = pose["drones"][i]
        assert dr["present"] is True
        assert "ekf_ned" in dr["avatars"] or "gps" in dr["avatars"]
        assert "attitude_q_xyzw" in dr
        assert len(dr["attitude_q_xyzw"]) == 4
    r = c.get(
        "/api/experiments/Baseball/series",
        params=[
            ("channels", "2.ulog.vehicle_local_position.x"),
            ("channels", "3.ulog.vehicle_local_position.x"),
            ("channels", "4.ulog.vehicle_local_position.x"),
        ],
    )
    assert r.status_code == 200
    series = r.json()
    for ch in series.values():
        assert len(ch["t"]) > 10
        assert ch["t"][0] <= 0.5  # ARM at T=0 (allow small first-sample slack)
    r = c.get("/api/experiments/Baseball/topics")
    assert r.status_code == 200
    topics = r.json()
    for i in ("2", "3", "4"):
        assert i in topics or int(i) in {int(k) for k in topics}
    r = c.get("/api/experiments/Baseball/duration")
    assert r.status_code == 200
    assert r.json()["t_max_s"] >= 150
