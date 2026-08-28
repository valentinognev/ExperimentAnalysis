from fastapi.testclient import TestClient

from app import app


def test_health():
    c = TestClient(app)
    r = c.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"ok": True}


def test_create_list_get_patch(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    c = TestClient(app)
    r = c.post("/api/experiments", json={"name": "Baseball"})
    assert r.status_code == 200
    assert r.json()["slug"] == "Baseball"
    r = c.get("/api/experiments")
    assert any(x["slug"] == "Baseball" for x in r.json())
    r = c.get("/api/experiments/nope")
    assert r.status_code == 404
    r = c.patch("/api/experiments/Baseball/manifest", json={"ui": {"engine3d": "plotly"}})
    assert r.status_code == 200
    assert r.json()["manifest"]["ui"]["engine3d"] == "plotly"


def test_post_add_drone(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    c = TestClient(app)
    c.post("/api/experiments", json={"name": "AddDrones"})
    r = c.post("/api/experiments/AddDrones/drones", json={"id": 2})
    assert r.status_code == 200
    drones = r.json()["manifest"]["drones"]
    d2 = next(d for d in drones if d["id"] == 2)
    assert d2["ssh"]["host"] == "192.168.31.30"


def test_post_add_drone_missing_slug_404(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    c = TestClient(app)
    r = c.post("/api/experiments/nope/drones", json={"id": 2})
    assert r.status_code == 404


def test_post_add_drone_id_zero_400(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    c = TestClient(app)
    c.post("/api/experiments", json={"name": "AddDronesZero"})
    r = c.post("/api/experiments/AddDronesZero/drones", json={"id": 0})
    assert r.status_code == 400


def test_post_import_with_drone_id_only_that_drone(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    c = TestClient(app)
    c.post("/api/experiments", json={"name": "ApiPerDrone"})
    src = tmp_path / "incoming"
    src.mkdir()
    for n in (2, 3, 4):
        (src / f"Group3RLcat{n}_log_1.ulg").write_bytes(b"ULog")
    r = c.post(
        "/api/experiments/ApiPerDrone/import",
        json={"paths": [str(src)], "drone_id": 2},
    )
    assert r.status_code == 200
    assert r.json()["ok"] is True
    root = tmp_path / "ApiPerDrone"
    assert (root / "raw" / "drone_2").exists()
    assert not (root / "raw" / "drone_3").exists()
    assert not (root / "raw" / "drone_4").exists()
