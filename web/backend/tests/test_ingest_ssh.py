import subprocess
from pathlib import Path

from ea.ingest_ssh import ssh_pull
from ea.manifest import load_manifest, save_manifest
from ea.store import create_experiment


def _setup_experiment(tmp_path, monkeypatch, drone_id=2, host="192.168.31.30", password=None):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    create_experiment("PullTest")
    manifest_path = tmp_path / "PullTest" / "manifest.json"
    manifest = load_manifest(manifest_path)
    drone = {
        "id": drone_id,
        "label": f"D{drone_id}",
        "ssh": {"user": "pi", "host": host},
        "sources": {
            "ulg": [],
            "system_manager": [],
            "hardware_adapter": [],
        },
    }
    if password:
        drone["ssh"]["password"] = password
    manifest["drones"] = [drone]
    save_manifest(manifest_path, manifest)


def test_ssh_uses_publickey_and_timeout_30(tmp_path, monkeypatch):
    recorded = []

    def fake_runner(cmd, **kwargs):
        recorded.append((list(cmd), kwargs))
        dest = Path(cmd[-1])
        dest.mkdir(parents=True, exist_ok=True)
        (dest / "20260814_system_manager_d2.csv").write_text("data")
        return subprocess.CompletedProcess(cmd, 0, "", "")

    _setup_experiment(tmp_path, monkeypatch)
    result = ssh_pull("PullTest", 2, runner=fake_runner)

    assert result["ok"] is True
    assert recorded
    joined = " ".join(str(part) for part, _ in recorded for part in part)
    assert "PreferredAuthentications=publickey" in joined
    assert all(kwargs.get("timeout") == 30 for _, kwargs in recorded)


def test_error_redacts_password(tmp_path, monkeypatch):
    secret = "super_secret_pw"

    def fake_runner(cmd, **kwargs):
        return subprocess.CompletedProcess(
            cmd,
            1,
            "",
            f"Permission denied, password was {secret}",
        )

    _setup_experiment(tmp_path, monkeypatch, password=secret)
    result = ssh_pull("PullTest", 2, runner=fake_runner)

    assert result["ok"] is False
    assert secret not in result.get("error", "")


def test_empty_remote_returns_error(tmp_path, monkeypatch):
    def fake_runner(cmd, **kwargs):
        dest = Path(cmd[-1])
        dest.mkdir(parents=True, exist_ok=True)
        return subprocess.CompletedProcess(cmd, 0, "", "")

    _setup_experiment(tmp_path, monkeypatch)
    result = ssh_pull("PullTest", 2, runner=fake_runner)

    assert result["ok"] is False
    assert "empty remote dir" in result.get("error", "")


def test_failure_does_not_delete_existing_raw(tmp_path, monkeypatch):
    _setup_experiment(tmp_path, monkeypatch)
    raw_dir = tmp_path / "PullTest" / "raw" / "drone_2"
    raw_dir.mkdir(parents=True)
    keeper = raw_dir / "existing.ulg"
    keeper.write_bytes(b"keep me")

    def fake_runner(cmd, **kwargs):
        return subprocess.CompletedProcess(cmd, 1, "", "rsync failed")

    result = ssh_pull("PullTest", 2, runner=fake_runner)

    assert result["ok"] is False
    assert keeper.is_file()
    assert keeper.read_bytes() == b"keep me"
