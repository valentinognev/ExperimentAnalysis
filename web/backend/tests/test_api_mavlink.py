from fastapi.testclient import TestClient

from app import app
from ea.ingest_files import import_paths
from ea.store import create_experiment


def _setup(tmp_path, monkeypatch, slug="MavApi"):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    create_experiment(slug)
    src = tmp_path / "incoming"
    src.mkdir()
    (src / "Group3RLcat2_log_1.ulg").write_bytes(b"ULog")
    import_paths(slug, [str(src)])


def test_mavlink_list_and_download_endpoints(tmp_path, monkeypatch):
    _setup(tmp_path, monkeypatch)
    list_calls = []
    dl_calls = []

    def fake_list(slug, drone_id, transport="tcp", serial=None, connect=None):
        list_calls.append((slug, drone_id, transport, serial))
        return {
            "ok": True,
            "logs": [{"id": 3, "time_utc": 2000, "size": 12}],
        }

    def fake_dl(
        slug,
        drone_id,
        log_id,
        transport="tcp",
        serial=None,
        confirm_replace=False,
        connect=None,
    ):
        dl_calls.append((slug, drone_id, log_id, transport, confirm_replace, serial))
        if not confirm_replace:
            return {
                "ok": False,
                "needs_replace": True,
                "existing": "raw/drone_2/old.ulg",
            }
        return {"ok": True}

    monkeypatch.setattr("app.mavlink_list_logs", fake_list)
    monkeypatch.setattr("app.mavlink_download_log", fake_dl)
    monkeypatch.setattr("app.rebuild", lambda slug: {"ok": True})

    c = TestClient(app)
    listed = c.post(
        "/api/experiments/MavApi/mavlink/logs",
        json={"drone_id": 2, "transport": "serial", "serial": "/dev/ttyUSB0"},
    )
    assert listed.status_code == 200
    assert listed.json()["logs"][0]["id"] == 3
    assert list_calls == [("MavApi", 2, "serial", "/dev/ttyUSB0")]

    blocked = c.post(
        "/api/experiments/MavApi/mavlink/download",
        json={"drone_id": 2, "log_id": 3, "transport": "tcp"},
    )
    assert blocked.status_code == 200
    assert blocked.json()["needs_replace"] is True

    done = c.post(
        "/api/experiments/MavApi/mavlink/download",
        json={
            "drone_id": 2,
            "log_id": 3,
            "transport": "tcp",
            "confirm_replace": True,
        },
    )
    assert done.status_code == 200
    assert done.json()["ok"] is True
    assert dl_calls[-1][4] is True


def test_mavlink_list_unknown_slug_404(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    c = TestClient(app)
    r = c.post(
        "/api/experiments/nope/mavlink/logs",
        json={"drone_id": 2, "transport": "tcp"},
    )
    assert r.status_code == 404
