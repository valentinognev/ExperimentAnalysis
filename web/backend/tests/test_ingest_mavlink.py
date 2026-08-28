from pathlib import Path

from pymavlink.dialects.v20 import common as mavlink2

from ea.ingest_mavlink import mavlink_download_log, mavlink_list_logs, mavlink_pull
from ea.manifest import load_manifest, save_manifest
from ea.store import create_experiment


def _setup_experiment(
    tmp_path,
    monkeypatch,
    drone_id=2,
    host="192.168.31.30",
    mavlink_url=None,
):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    create_experiment("MavTest")
    manifest_path = tmp_path / "MavTest" / "manifest.json"
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
    if mavlink_url is not None:
        drone["mavlink"] = {"url": mavlink_url}
    manifest["drones"] = [drone]
    save_manifest(manifest_path, manifest)
    return manifest_path


class FakeMav:
    def __init__(self, parent):
        self.parent = parent
        self.command_long_calls = []

    def log_request_list_send(self, target_system, target_component, start, end):
        self.parent.requests.append(
            ("log_request_list", target_system, target_component, start, end)
        )
        m = mavlink2.MAVLink(None)
        n = len(self.parent.logs)
        for log in self.parent.logs:
            self.parent.entry_queue.append(
                m.log_entry_encode(
                    log["id"], n, log["id"], log["time_utc"], log["size"]
                )
            )

    def log_request_data_send(self, target_system, target_component, log_id, ofs, count):
        self.parent.requests.append(
            ("log_request_data", target_system, target_component, log_id, ofs, count)
        )
        log = self.parent.logs_by_id[log_id]
        chunk = log["data"][ofs : ofs + count]
        m = mavlink2.MAVLink(None)
        self.parent.data_queue.append(
            m.log_data_encode(log_id, ofs, len(chunk), chunk)
        )

    def mavlink_msg_command_long_send(self, *args, **kwargs):
        self.command_long_calls.append(("mavlink_msg_command_long_send", args, kwargs))

    def command_long_send(self, *args, **kwargs):
        self.command_long_calls.append(("command_long_send", args, kwargs))


class FakeConn:
    def __init__(self, logs):
        self.logs = logs
        self.logs_by_id = {log["id"]: log for log in logs}
        self.mav = FakeMav(self)
        self.requests = []
        self.entry_queue = []
        self.data_queue = []

    def close(self):
        pass

    def recv_match(self, type=None, blocking=False, timeout=None):
        if type == "LOG_ENTRY":
            return self.entry_queue.pop(0) if self.entry_queue else None
        if type == "LOG_DATA":
            return self.data_queue.pop(0) if self.data_queue else None
        return None


def _make_connect(logs):
    conn_holder = {}

    def connect(url, baud=None):
        conn_holder["url"] = url
        conn_holder["baud"] = baud
        conn = FakeConn(logs)
        conn_holder["conn"] = conn
        return conn

    return connect, conn_holder


def test_mavlink_downloads_latest_ulg(tmp_path, monkeypatch):
    ulg_bytes = b"PX4 ulog payload bytes"
    logs = [
        {"id": 1, "time_utc": 1000, "size": 10, "data": b"old log!!!"},
        {"id": 2, "time_utc": 2000, "size": len(ulg_bytes), "data": ulg_bytes},
    ]
    connect, holder = _make_connect(logs)
    _setup_experiment(tmp_path, monkeypatch)

    result = mavlink_pull("MavTest", 2, connect=connect)

    assert result["ok"] is True
    assert holder["url"] == "tcp:192.168.31.30:5760"
    raw_dir = tmp_path / "MavTest" / "raw" / "drone_2"
    ulg_files = list(raw_dir.glob("*.ulg"))
    assert len(ulg_files) == 1
    assert ulg_files[0].read_bytes() == ulg_bytes

    manifest = load_manifest(tmp_path / "MavTest" / "manifest.json")
    ulg_sources = manifest["drones"][0]["sources"]["ulg"]
    assert len(ulg_sources) == 1
    assert ulg_sources[0].endswith(ulg_files[0].name)


def test_mavlink_never_sends_command_long(tmp_path, monkeypatch):
    logs = [{"id": 1, "time_utc": 1000, "size": 4, "data": b"test"}]
    connect, holder = _make_connect(logs)
    _setup_experiment(tmp_path, monkeypatch)

    result = mavlink_pull("MavTest", 2, connect=connect)

    assert result["ok"] is True
    conn = holder["conn"]
    assert conn.mav.command_long_calls == []
    sent_types = {r[0] for r in conn.requests}
    assert "command_long" not in sent_types
    assert sent_types <= {"log_request_list", "log_request_data"}


def test_no_logs_returns_error_preserves_raw(tmp_path, monkeypatch):
    connect, _holder = _make_connect([])
    _setup_experiment(tmp_path, monkeypatch)
    raw_dir = tmp_path / "MavTest" / "raw" / "drone_2"
    raw_dir.mkdir(parents=True)
    keeper = raw_dir / "existing.ulg"
    keeper.write_bytes(b"keep me")

    result = mavlink_pull("MavTest", 2, connect=connect)

    assert result["ok"] is False
    assert "no log" in result.get("error", "").lower()
    assert keeper.is_file()
    assert keeper.read_bytes() == b"keep me"
    assert list(raw_dir.glob("*.ulg")) == [keeper]


def test_log_request_list_uses_pymavlink_arg_order(tmp_path, monkeypatch):
    logs = [{"id": 1, "time_utc": 1000, "size": 3, "data": b"abc"}]
    connect, holder = _make_connect(logs)
    _setup_experiment(tmp_path, monkeypatch)

    result = mavlink_pull("MavTest", 2, connect=connect)

    assert result["ok"] is True
    conn = holder["conn"]
    list_requests = [r for r in conn.requests if r[0] == "log_request_list"]
    assert len(list_requests) == 1
    _, target_system, target_component, start, end = list_requests[0]
    assert target_system == 1
    assert target_component == 1
    assert start == 0
    assert end == 0xFFFF


def test_mavlink_url_from_manifest(tmp_path, monkeypatch):
    logs = [{"id": 1, "time_utc": 1000, "size": 3, "data": b"abc"}]
    connect, holder = _make_connect(logs)
    _setup_experiment(
        tmp_path,
        monkeypatch,
        mavlink_url="tcp:10.0.0.5:5760",
    )

    result = mavlink_pull("MavTest", 2, connect=connect)

    assert result["ok"] is True
    assert holder["url"] == "tcp:10.0.0.5:5760"


def test_list_logs_does_not_write_ulg(tmp_path, monkeypatch):
    logs = [
        {"id": 1, "time_utc": 1000, "size": 4, "data": b"old!"},
        {"id": 2, "time_utc": 2000, "size": 4, "data": b"new!"},
    ]
    connect, holder = _make_connect(logs)
    _setup_experiment(tmp_path, monkeypatch)

    result = mavlink_list_logs("MavTest", 2, transport="tcp", connect=connect)

    assert result["ok"] is True
    assert [e["id"] for e in result["logs"]] == [1, 2]
    assert result["logs"][1]["size"] == 4
    raw_dir = tmp_path / "MavTest" / "raw" / "drone_2"
    assert list(raw_dir.glob("*.ulg")) == []
    assert holder["url"] == "tcp:192.168.31.30:5760"
    assert holder["baud"] is None


def test_list_logs_serial_uses_device_and_baud(tmp_path, monkeypatch):
    logs = [{"id": 1, "time_utc": 1000, "size": 3, "data": b"abc"}]
    connect, holder = _make_connect(logs)
    _setup_experiment(tmp_path, monkeypatch)

    result = mavlink_list_logs(
        "MavTest",
        2,
        transport="serial",
        serial="/dev/ttyACM0",
        connect=connect,
    )

    assert result["ok"] is True
    assert holder["url"] == "/dev/ttyACM0"
    assert holder["baud"] == 57600


def test_download_selected_log_not_latest(tmp_path, monkeypatch):
    old = b"old log bytes"
    new = b"newer payload!!"
    logs = [
        {"id": 1, "time_utc": 1000, "size": len(old), "data": old},
        {"id": 2, "time_utc": 2000, "size": len(new), "data": new},
    ]
    connect, _holder = _make_connect(logs)
    _setup_experiment(tmp_path, monkeypatch)

    result = mavlink_download_log(
        "MavTest", 2, log_id=1, transport="tcp", connect=connect
    )

    assert result["ok"] is True
    raw_dir = tmp_path / "MavTest" / "raw" / "drone_2"
    ulg_files = list(raw_dir.glob("*.ulg"))
    assert len(ulg_files) == 1
    assert ulg_files[0].read_bytes() == old


def test_download_without_confirm_keeps_existing_ulg(tmp_path, monkeypatch):
    logs = [{"id": 1, "time_utc": 1000, "size": 4, "data": b"new!"}]
    connect, _holder = _make_connect(logs)
    _setup_experiment(tmp_path, monkeypatch)
    raw_dir = tmp_path / "MavTest" / "raw" / "drone_2"
    raw_dir.mkdir(parents=True)
    keeper = raw_dir / "existing.ulg"
    keeper.write_bytes(b"keep me")
    manifest_path = tmp_path / "MavTest" / "manifest.json"
    manifest = load_manifest(manifest_path)
    manifest["drones"][0]["sources"]["ulg"] = ["raw/drone_2/existing.ulg"]
    save_manifest(manifest_path, manifest)

    result = mavlink_download_log(
        "MavTest", 2, log_id=1, transport="tcp", connect=connect
    )

    assert result["ok"] is False
    assert result.get("needs_replace") is True
    assert "existing.ulg" in result.get("existing", "")
    assert keeper.read_bytes() == b"keep me"


def test_download_with_confirm_replaces_single_ulg(tmp_path, monkeypatch):
    payload = b"replacement ulg"
    logs = [{"id": 7, "time_utc": 3000, "size": len(payload), "data": payload}]
    connect, _holder = _make_connect(logs)
    _setup_experiment(tmp_path, monkeypatch)
    raw_dir = tmp_path / "MavTest" / "raw" / "drone_2"
    raw_dir.mkdir(parents=True)
    old = raw_dir / "old.ulg"
    old.write_bytes(b"previous")
    extra = raw_dir / "also.ulg"
    extra.write_bytes(b"second")
    manifest_path = tmp_path / "MavTest" / "manifest.json"
    manifest = load_manifest(manifest_path)
    manifest["drones"][0]["sources"]["ulg"] = [
        "raw/drone_2/old.ulg",
        "raw/drone_2/also.ulg",
    ]
    save_manifest(manifest_path, manifest)

    result = mavlink_download_log(
        "MavTest",
        2,
        log_id=7,
        transport="tcp",
        confirm_replace=True,
        connect=connect,
    )

    assert result["ok"] is True
    ulg_files = sorted(raw_dir.glob("*.ulg"))
    assert len(ulg_files) == 1
    assert ulg_files[0].read_bytes() == payload
    assert not old.exists()
    assert not extra.exists()
    manifest = load_manifest(manifest_path)
    ulg_sources = manifest["drones"][0]["sources"]["ulg"]
    assert len(ulg_sources) == 1
    assert ulg_sources[0].endswith(ulg_files[0].name)
