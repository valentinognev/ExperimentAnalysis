import subprocess
from pathlib import Path

from ea.ingest_ssh import (
    parse_rsync_progress,
    ssh_copy_events,
    ssh_copy_logs,
    ssh_list_logs,
    ssh_pull,
)
from ea.manifest import load_manifest, save_manifest
from ea.store import create_experiment

MISSING_DIR_ERR = (
    'rsync: [sender] change_dir "/home/pi/RL/missing" '
    "failed: No such file or directory (2)\n"
    "rsync error: some files/attrs were not transferred "
    "(see previous errors) (code 23) at main.c(1887) [Receiver=3.2.7]\n"
    "rsync: [Receiver] write error: Broken pipe (32)\n"
)

SM_LISTING = (
    "drwxrwxr-x          4,096 2026/08/25 05:00:00 .\n"
    "-rw-rw-r--         12,345 2026/08/25 17:05:30 20260825_system_manager_d2.csv\n"
    "-rw-rw-r--          9,001 2026/08/14 09:29:31 20260814_system_manager_d2.csv\n"
    "-rw-rw-r--            100 2026/08/01 01:00:00 notes.txt\n"
)

HA_LISTING = (
    "drwxrwxr-x          4,096 2026/08/25 05:00:00 .\n"
    "-rw-rw-r--        500,000 2026/08/25 17:06:00 20260825_adapter_diag.log\n"
    "-rw-rw-r--         20,000 2026/08/25 17:06:01 20260825_mavlink.txt\n"
)


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


def _remote_of(cmd: list[str]) -> str:
    src = cmd[-1] if "--list-only" in cmd else cmd[-2]
    return src.split(":", 1)[1]


def _listing_runner(listings: dict[str, str | None], recorded=None, copies=None):
    def fake_runner(cmd, **kwargs):
        if recorded is not None:
            recorded.append((list(cmd), kwargs))
        remote = _remote_of(cmd)
        if "--list-only" in cmd:
            listing = listings.get(remote)
            if listing is None:
                return subprocess.CompletedProcess(cmd, 23, "", MISSING_DIR_ERR)
            return subprocess.CompletedProcess(cmd, 0, listing, "")
        dest = Path(cmd[-1])
        dest.mkdir(parents=True, exist_ok=True)
        name = Path(remote.rstrip("/")).name
        (dest / name).write_text("copied")
        if copies is not None:
            copies.append(remote)
        return subprocess.CompletedProcess(cmd, 0, "sent", "")

    return fake_runner


def test_list_probes_catswarm_then_classic_and_rl_logs(tmp_path, monkeypatch):
    """D2: SM is ~/RL/system_manager/logs; Python HA writes ~/RL/logs."""
    recorded = []
    listings = {
        "~/RL/system_manager/logs/": SM_LISTING,
        "~/RL/logs/": HA_LISTING,
    }
    _setup_experiment(tmp_path, monkeypatch)
    result = ssh_list_logs("PullTest", 2, runner=_listing_runner(listings, recorded))

    assert result["ok"] is True
    names = [e["name"] for e in result["logs"]]
    assert "20260825_system_manager_d2.csv" in names
    assert "20260814_system_manager_d2.csv" in names
    assert "20260825_adapter_diag.log" in names
    assert "20260825_mavlink.txt" in names
    assert "notes.txt" not in names

    sm = next(e for e in result["logs"] if e["name"] == "20260825_system_manager_d2.csv")
    assert sm["kind"] == "sm"
    assert sm["size"] == 12345
    assert sm["mtime"] == "2026/08/25 17:05:30"
    assert sm["remote"] == "~/RL/system_manager/logs/20260825_system_manager_d2.csv"
    mtimes = [e["mtime"] for e in result["logs"]]
    assert mtimes == sorted(mtimes, reverse=True)

    ha = next(e for e in result["logs"] if e["name"] == "20260825_adapter_diag.log")
    assert ha["kind"] == "ha"
    assert ha["remote"] == "~/RL/logs/20260825_adapter_diag.log"

    remotes_listed = [_remote_of(cmd) for cmd, _ in recorded if "--list-only" in cmd]
    assert remotes_listed[0] == "~/RL/CatSwarm/system_manager/logs/"
    assert "~/RL/system_manager/logs/" in remotes_listed
    assert "~/RL/CatSwarm/hardware_adapter/logs/" in remotes_listed
    assert "~/RL/hardware_adapter/logs/" in remotes_listed
    assert "~/RL/logs/" in remotes_listed

    for cmd, kwargs in recorded:
        assert kwargs.get("timeout") == 30
        assert "PreferredAuthentications=publickey" in " ".join(cmd)
        assert "--list-only" in cmd or cmd[0] == "rsync"


def test_list_skips_missing_ha_dir(tmp_path, monkeypatch):
    listings = {"~/RL/system_manager/logs/": SM_LISTING}
    _setup_experiment(tmp_path, monkeypatch)
    result = ssh_list_logs("PullTest", 2, runner=_listing_runner(listings))

    assert result["ok"] is True
    kinds = {e["kind"] for e in result["logs"]}
    assert kinds == {"sm"}


def test_list_argv_has_no_password(tmp_path, monkeypatch):
    secret = "must_not_appear"
    recorded = []
    listings = {"~/RL/system_manager/logs/": SM_LISTING}
    _setup_experiment(tmp_path, monkeypatch, password=secret)
    ssh_list_logs("PullTest", 2, runner=_listing_runner(listings, recorded))

    for cmd, _ in recorded:
        joined = " ".join(cmd)
        assert secret not in joined
        for part in cmd:
            assert secret not in part


def test_list_empty_is_error(tmp_path, monkeypatch):
    _setup_experiment(tmp_path, monkeypatch)
    result = ssh_list_logs("PullTest", 2, runner=_listing_runner({}))

    assert result["ok"] is False
    assert "no logs" in result.get("error", "").lower()


def test_copy_only_selected_files(tmp_path, monkeypatch):
    copies = []
    listings = {
        "~/RL/system_manager/logs/": SM_LISTING,
        "~/RL/logs/": HA_LISTING,
    }
    _setup_experiment(tmp_path, monkeypatch)
    result = ssh_copy_logs(
        "PullTest",
        2,
        files=[
            {
                "remote": "~/RL/system_manager/logs/20260825_system_manager_d2.csv",
                "name": "20260825_system_manager_d2.csv",
            },
        ],
        runner=_listing_runner(listings, copies=copies),
    )

    assert result["ok"] is True
    assert copies == ["~/RL/system_manager/logs/20260825_system_manager_d2.csv"]
    raw = tmp_path / "PullTest" / "raw" / "drone_2"
    assert (raw / "20260825_system_manager_d2.csv").is_file()
    assert not (raw / "20260814_system_manager_d2.csv").exists()
    assert not (raw / "20260825_adapter_diag.log").exists()
    manifest = load_manifest(tmp_path / "PullTest" / "manifest.json")
    sm_sources = manifest["drones"][0]["sources"]["system_manager"]
    assert any("20260825_system_manager_d2.csv" in p for p in sm_sources)
    assert not manifest["drones"][0]["sources"]["hardware_adapter"]


def test_copy_rejects_path_outside_candidates(tmp_path, monkeypatch):
    _setup_experiment(tmp_path, monkeypatch)
    result = ssh_copy_logs(
        "PullTest",
        2,
        files=[{"remote": "~/RL/../../../etc/passwd", "name": "passwd"}],
        runner=_listing_runner({}),
    )
    assert result["ok"] is False
    assert "not allowed" in result.get("error", "").lower()


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
    result = ssh_list_logs("PullTest", 2, runner=fake_runner)

    assert result["ok"] is False
    assert secret not in result.get("error", "")


def test_empty_remote_returns_error(tmp_path, monkeypatch):
    _setup_experiment(tmp_path, monkeypatch)
    result = ssh_pull("PullTest", 2, runner=_listing_runner({}))

    assert result["ok"] is False
    assert "empty remote dir" in result.get("error", "") or "no logs" in result.get(
        "error", ""
    ).lower()


def test_empty_remote_with_existing_raw_returns_error(tmp_path, monkeypatch):
    """Empty remote is ok=False even when dest already has imported ulogs."""
    _setup_experiment(tmp_path, monkeypatch)
    raw_dir = tmp_path / "PullTest" / "raw" / "drone_2"
    raw_dir.mkdir(parents=True)
    ulog = raw_dir / "flight.ulg"
    ulog.write_bytes(b"existing ulog import")

    result = ssh_pull("PullTest", 2, runner=_listing_runner({}))

    assert result["ok"] is False
    assert ulog.is_file()
    assert ulog.read_bytes() == b"existing ulog import"


def test_empty_remote_with_existing_sm_is_ok(tmp_path, monkeypatch):
    """Pi logs already in raw/ count as success when the remote has nothing new."""
    _setup_experiment(tmp_path, monkeypatch)
    raw_dir = tmp_path / "PullTest" / "raw" / "drone_2"
    raw_dir.mkdir(parents=True)
    sm = raw_dir / "20260814_system_manager_d2.csv"
    sm.write_text("local_ts,S\n1,4\n")

    result = ssh_pull("PullTest", 2, runner=_listing_runner({}))

    assert result["ok"] is True
    manifest = load_manifest(tmp_path / "PullTest" / "manifest.json")
    sm_sources = manifest["drones"][0]["sources"]["system_manager"]
    assert any("system_manager" in p for p in sm_sources)


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


def test_missing_ha_dir_still_ok_when_sm_copied(tmp_path, monkeypatch):
    """HA logs/ absent on the Pi is not a hard fail if SM copy worked."""
    copies = []
    listings = {"~/RL/system_manager/logs/": SM_LISTING}
    _setup_experiment(tmp_path, monkeypatch)
    result = ssh_pull("PullTest", 2, runner=_listing_runner(listings, copies=copies))

    assert result["ok"] is True
    assert any("system_manager_d2.csv" in r for r in copies)
    assert not any("adapter_diag" in r for r in copies)
    raw = tmp_path / "PullTest" / "raw" / "drone_2"
    assert (raw / "20260825_system_manager_d2.csv").is_file()
    manifest = load_manifest(tmp_path / "PullTest" / "manifest.json")
    assert manifest["drones"][0]["sources"]["system_manager"]


def test_parse_rsync_progress_bytes_and_pct():
    assert parse_rsync_progress("     1,048,576  50%  1.23MB/s    0:00:01") == (1048576, 50)
    assert parse_rsync_progress("        12345 100%") == (12345, 100)
    assert parse_rsync_progress("drwxrwxr-x          4,096 2026/08/25 05:00:00 .") is None


def test_copy_events_include_progress(tmp_path, monkeypatch):
    listings = {"~/RL/system_manager/logs/": SM_LISTING}
    _setup_experiment(tmp_path, monkeypatch)
    events = list(
        ssh_copy_events(
            "PullTest",
            2,
            files=[
                {
                    "remote": "~/RL/system_manager/logs/20260825_system_manager_d2.csv",
                    "name": "20260825_system_manager_d2.csv",
                    "size": 12345,
                }
            ],
            runner=_listing_runner(listings),
        )
    )
    progress = [e for e in events if e.get("event") == "progress"]
    assert progress
    assert progress[0]["name"] == "20260825_system_manager_d2.csv"
    assert progress[0]["index"] == 1
    assert progress[0]["count"] == 1
    assert events[-1]["event"] == "done"
    assert events[-1]["ok"] is True


def test_copy_cancel_kills_rsync_and_drops_partial(tmp_path, monkeypatch):
    import io

    _setup_experiment(tmp_path, monkeypatch)
    killed = []
    dest_written = []

    class FakeProc:
        def __init__(self, cmd):
            dest = Path(cmd[-1])
            dest.mkdir(parents=True, exist_ok=True)
            name = Path(cmd[-2].split(":", 1)[1]).name
            partial = dest / name
            partial.write_text("partial")
            dest_written.append(partial)
            self.stdout = io.StringIO("      100  10%\r      200  20%\r")
            self.returncode = None

        def poll(self):
            return self.returncode

        def kill(self):
            killed.append(True)
            self.returncode = -9

        def wait(self, timeout=None):
            if self.returncode is None:
                self.returncode = 0
            return self.returncode

    def fake_popen(cmd, **kwargs):
        return FakeProc(cmd)

    calls = {"n": 0}

    def cancel_check():
        calls["n"] += 1
        return calls["n"] > 1

    result = ssh_copy_logs(
        "PullTest",
        2,
        files=[
            {
                "remote": "~/RL/system_manager/logs/20260825_system_manager_d2.csv",
                "name": "20260825_system_manager_d2.csv",
                "size": 12345,
            }
        ],
        popen=fake_popen,
        cancel_check=cancel_check,
    )

    assert result["ok"] is False
    assert "cancel" in result.get("error", "").lower()
    assert killed
    for path in dest_written:
        assert not path.exists()
    manifest = load_manifest(tmp_path / "PullTest" / "manifest.json")
    assert manifest["drones"][0]["sources"]["system_manager"] == []
