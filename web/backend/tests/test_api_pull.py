import json

from fastapi.testclient import TestClient

from app import app
from ea.ingest_files import import_paths
from ea.manifest import load_manifest
from ea.store import create_experiment


def _setup_experiment(tmp_path, monkeypatch, slug="PullApi"):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    create_experiment(slug)
    src = tmp_path / "incoming"
    src.mkdir()
    (src / "Group3RLcat2_log_1.ulg").write_bytes(b"ULog")
    import_paths(slug, [str(src)])


def test_pull_mocked_ingest(tmp_path, monkeypatch):
    _setup_experiment(tmp_path, monkeypatch)
    calls = []

    def fake_ssh(slug, drone_id, runner=None):
        calls.append(("ssh", slug, drone_id))
        return {"ok": True}

    def fake_mavlink(slug, drone_id, connect=None):
        calls.append(("mavlink", slug, drone_id))
        return {"ok": True}

    monkeypatch.setattr("app.ssh_pull", fake_ssh)
    monkeypatch.setattr("app.mavlink_pull", fake_mavlink)

    c = TestClient(app)
    r = c.post(
        "/api/experiments/PullApi/pull",
        json={"drone_id": 2, "adapters": ["ssh", "mavlink"]},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["drones"]["2"]["ok"] is True
    assert calls == [("ssh", "PullApi", 2), ("mavlink", "PullApi", 2)]


def test_pull_unknown_slug_404(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    c = TestClient(app)
    r = c.post(
        "/api/experiments/nope/pull",
        json={"drone_id": 2, "adapters": ["ssh"]},
    )
    assert r.status_code == 404


def test_pull_password_not_in_json(tmp_path, monkeypatch):
    _setup_experiment(tmp_path, monkeypatch)
    secret = "super_secret_pw_12345"
    from ea.manifest import load_manifest, save_manifest

    manifest_path = tmp_path / "PullApi" / "manifest.json"
    manifest = load_manifest(manifest_path)
    manifest["drones"][0]["ssh"]["password"] = secret
    save_manifest(manifest_path, manifest)

    def fake_ssh(slug, drone_id, runner=None):
        return {"ok": False, "error": f"auth failed: {secret}"}

    monkeypatch.setattr("app.ssh_pull", fake_ssh)

    c = TestClient(app)
    r = c.post(
        "/api/experiments/PullApi/pull",
        json={"drone_id": 2, "adapters": ["ssh"]},
    )
    assert r.status_code == 200
    raw = json.dumps(r.json())
    assert secret not in raw


def test_default_drone_host_seeds(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    create_experiment("Seeds")
    src = tmp_path / "incoming"
    src.mkdir()
    for n in (2, 3, 4):
        (src / f"Group3RLcat{n}_log_1.ulg").write_bytes(b"ULog")
    import_paths("Seeds", [str(src)])

    manifest = load_manifest(tmp_path / "Seeds" / "manifest.json")
    d2 = next(d for d in manifest["drones"] if d["id"] == 2)
    d3 = next(d for d in manifest["drones"] if d["id"] == 3)
    d4 = next(d for d in manifest["drones"] if d["id"] == 4)

    assert d2["ssh"]["host"] == "192.168.31.30"
    assert d2["ssh"]["user"] == "pi"
    assert d2["mavlink"]["url"] == "tcp:192.168.31.30:5760"

    assert d4["ssh"]["host"] == "192.168.31.152"
    assert d4["mavlink"]["url"] == "tcp:192.168.31.152:5760"

    assert not (d3.get("ssh") or {}).get("host")
    assert "mavlink" not in d3
