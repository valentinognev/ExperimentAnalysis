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
