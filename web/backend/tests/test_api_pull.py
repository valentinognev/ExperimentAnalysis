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

    def fake_rebuild(slug):
        return {"ok": True}

    monkeypatch.setattr("app.ssh_pull", fake_ssh)
    monkeypatch.setattr("app.mavlink_pull", fake_mavlink)
    monkeypatch.setattr("app.rebuild", fake_rebuild)

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


def test_pull_success_triggers_rebuild(tmp_path, monkeypatch):
    _setup_experiment(tmp_path, monkeypatch)
    rebuild_calls = []

    def fake_ssh(slug, drone_id, runner=None):
        return {"ok": True}

    def fake_rebuild(slug):
        rebuild_calls.append(slug)
        return {"ok": True}

    monkeypatch.setattr("app.ssh_pull", fake_ssh)
    monkeypatch.setattr("app.rebuild", fake_rebuild)

    c = TestClient(app)
    r = c.post(
        "/api/experiments/PullApi/pull",
        json={"drone_id": 2, "adapters": ["ssh"]},
    )
    assert r.status_code == 200
    assert r.json()["ok"] is True
    assert rebuild_calls == ["PullApi"]


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


def test_ssh_logs_and_copy_endpoints(tmp_path, monkeypatch):
    _setup_experiment(tmp_path, monkeypatch)
    listed = {
        "ok": True,
        "logs": [
            {
                "kind": "sm",
                "name": "20260825_system_manager_d2.csv",
                "remote": "~/RL/system_manager/logs/20260825_system_manager_d2.csv",
                "size": 123,
                "mtime": "2026/08/25 17:05:30",
            }
        ],
    }
    copied = []

    def fake_list(slug, drone_id, runner=None):
        return listed

    def fake_copy(slug, drone_id, files, runner=None):
        copied.append((slug, drone_id, files))
        return {"ok": True}

    def fake_rebuild(slug):
        return {"ok": True}

    monkeypatch.setattr("app.ssh_list_logs", fake_list)
    monkeypatch.setattr("app.ssh_copy_logs", fake_copy)
    monkeypatch.setattr("app.rebuild", fake_rebuild)

    c = TestClient(app)
    r = c.post(
        "/api/experiments/PullApi/ssh/logs",
        json={"drone_id": 2},
    )
    assert r.status_code == 200
    assert r.json()["logs"][0]["name"] == "20260825_system_manager_d2.csv"

    r = c.post(
        "/api/experiments/PullApi/ssh/copy",
        json={
            "drone_id": 2,
            "files": [
                {
                    "remote": "~/RL/system_manager/logs/20260825_system_manager_d2.csv",
                    "name": "20260825_system_manager_d2.csv",
                }
            ],
        },
    )
    assert r.status_code == 200
    assert r.json()["ok"] is True
    assert copied[0][1] == 2
    assert copied[0][2][0]["name"] == "20260825_system_manager_d2.csv"


def test_ssh_copy_streams_event_stream(tmp_path, monkeypatch):
    _setup_experiment(tmp_path, monkeypatch)

    def fake_events(slug, drone_id, files, cancel_check=None):
        yield {
            "event": "progress",
            "name": files[0]["name"],
            "index": 1,
            "count": 1,
            "bytes": 0,
            "total": 10,
            "pct": 0,
        }
        yield {"event": "done", "ok": True}

    monkeypatch.setattr("app.ssh_copy_events", fake_events)
    monkeypatch.setattr("app.rebuild", lambda slug: {"ok": True})

    c = TestClient(app)
    r = c.post(
        "/api/experiments/PullApi/ssh/copy",
        json={
            "drone_id": 2,
            "files": [
                {
                    "remote": "~/RL/system_manager/logs/a.csv",
                    "name": "a.csv",
                }
            ],
        },
        headers={"Accept": "text/event-stream"},
    )
    assert r.status_code == 200
    assert "text/event-stream" in r.headers["content-type"]
    assert "no-cache" in r.headers.get("cache-control", "")
    assert "no-transform" in r.headers.get("cache-control", "")
    assert r.headers.get("x-accel-buffering") == "no"
    assert r.text.startswith("data: ")
    assert "\n\n" in r.text
    payloads = [
        json.loads(line[6:]) for line in r.text.split("\n") if line.startswith("data: ")
    ]
    assert payloads[0]["event"] == "progress"
    assert payloads[-1]["event"] == "done"


def test_ssh_copy_stream_does_not_rebuild(tmp_path, monkeypatch):
    _setup_experiment(tmp_path, monkeypatch)
    rebuild_calls = []

    def fake_events(slug, drone_id, files, cancel_check=None):
        yield {"event": "done", "ok": True}

    def fake_rebuild(slug):
        rebuild_calls.append(slug)
        return {"ok": True}

    monkeypatch.setattr("app.ssh_copy_events", fake_events)
    monkeypatch.setattr("app.rebuild", fake_rebuild)

    c = TestClient(app)
    r = c.post(
        "/api/experiments/PullApi/ssh/copy",
        json={
            "drone_id": 2,
            "files": [
                {
                    "remote": "~/RL/system_manager/logs/a.csv",
                    "name": "a.csv",
                }
            ],
        },
        headers={"Accept": "text/event-stream"},
    )
    assert r.status_code == 200
    assert '"event": "done"' in r.text or '"event":"done"' in r.text
    assert rebuild_calls == []


def test_mavlink_download_stream_does_not_rebuild(tmp_path, monkeypatch):
    _setup_experiment(tmp_path, monkeypatch)
    rebuild_calls = []

    def fake_events(*args, **kwargs):
        yield {"event": "done", "ok": True}

    def fake_rebuild(slug):
        rebuild_calls.append(slug)
        return {"ok": True}

    monkeypatch.setattr("app.mavlink_download_events", fake_events)
    monkeypatch.setattr("app.rebuild", fake_rebuild)

    c = TestClient(app)
    r = c.post(
        "/api/experiments/PullApi/mavlink/download",
        json={"drone_id": 2, "log_id": 1, "transport": "tcp"},
        headers={"Accept": "text/event-stream"},
    )
    assert r.status_code == 200
    assert '"event": "done"' in r.text or '"event":"done"' in r.text
    assert rebuild_calls == []


def test_ssh_copy_json_rebuilds_once(tmp_path, monkeypatch):
    _setup_experiment(tmp_path, monkeypatch)
    rebuild_calls = []

    def fake_copy(slug, drone_id, files, runner=None):
        return {"ok": True}

    def fake_rebuild(slug):
        rebuild_calls.append(slug)
        return {"ok": True}

    monkeypatch.setattr("app.ssh_copy_logs", fake_copy)
    monkeypatch.setattr("app.rebuild", fake_rebuild)

    c = TestClient(app)
    r = c.post(
        "/api/experiments/PullApi/ssh/copy",
        json={
            "drone_id": 2,
            "files": [
                {
                    "remote": "~/RL/system_manager/logs/a.csv",
                    "name": "a.csv",
                }
            ],
        },
    )
    assert r.status_code == 200
    assert r.json()["ok"] is True
    assert rebuild_calls == ["PullApi"]


def test_ssh_copy_streams_when_accept_ndjson(tmp_path, monkeypatch):
    _setup_experiment(tmp_path, monkeypatch)

    def fake_events(slug, drone_id, files, cancel_check=None):
        yield {"event": "done", "ok": True}

    monkeypatch.setattr("app.ssh_copy_events", fake_events)
    monkeypatch.setattr("app.rebuild", lambda slug: {"ok": True})

    c = TestClient(app)
    r = c.post(
        "/api/experiments/PullApi/ssh/copy",
        json={
            "drone_id": 2,
            "files": [
                {
                    "remote": "~/RL/system_manager/logs/a.csv",
                    "name": "a.csv",
                }
            ],
        },
        headers={"Accept": "application/x-ndjson"},
    )
    assert r.status_code == 200
    assert "text/event-stream" in r.headers["content-type"]
    assert "data: " in r.text


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
