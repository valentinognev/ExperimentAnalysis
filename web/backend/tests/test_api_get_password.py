"""GET experiment must not return ssh.password."""

from fastapi.testclient import TestClient

from app import app
from ea.manifest import load_manifest, save_manifest
from ea.store import create_experiment


def test_get_experiment_strips_ssh_password(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    create_experiment("Secret")
    manifest_path = tmp_path / "Secret" / "manifest.json"
    manifest = load_manifest(manifest_path)
    manifest["drones"] = [
        {
            "id": 2,
            "label": "D2",
            "ssh": {"host": "192.168.1.1", "user": "pi", "password": "hunter2"},
            "sources": {"ulg": [], "system_manager": [], "hardware_adapter": []},
        }
    ]
    save_manifest(manifest_path, manifest)

    c = TestClient(app)
    r = c.get("/api/experiments/Secret")
    assert r.status_code == 200
    body = r.json()
    d2 = next(d for d in body["manifest"]["drones"] if d["id"] == 2)
    assert "password" not in d2.get("ssh", {})
    assert d2["ssh"]["host"] == "192.168.1.1"

    # password still on disk
    disk = load_manifest(manifest_path)
    assert disk["drones"][0]["ssh"]["password"] == "hunter2"
