import os
import subprocess
import threading

import pytest

from ea.manifest import load_manifest, save_manifest
from ea.replay.replay_argv import build_replay_argv
from ea.replay.replay_job import (
    BusyError,
    claim_busy,
    get_job,
    is_busy,
    request_stop,
    reset_jobs,
    start_replay,
    testing_put_running,
    testing_set_busy,
)
from ea.store import create_experiment, set_drone_count
from ea.ulog_min import write_min_ulog

CONTAINER_ULG = (
    "/home/valentin/ExperimentAnalysis/experiments/S/replay/work/r1/input.ulg"
)


@pytest.fixture(autouse=True)
def _reset():
    reset_jobs()
    yield
    reset_jobs()


def _orig(tmp_path):
    p = tmp_path / "in.ulg"
    write_min_ulog(
        p,
        {"vehicle_local_position": [{"timestamp": 0, "x": 0.0, "y": 0.0, "z": 0.0}]},
    )
    return p


def _setup_experiment(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    create_experiment("S")
    set_drone_count("S", 2)
    manifest_path = tmp_path / "S" / "manifest.json"
    manifest = load_manifest(manifest_path)
    manifest["ui"]["visible_drone_ids"] = [2]
    save_manifest(manifest_path, manifest)


def _base_kw(tmp_path, orig=None):
    if orig is None:
        orig = _orig(tmp_path)
    sitl = tmp_path / "sitl"
    sitl.mkdir(exist_ok=True)
    return dict(
        slug="S",
        parent_id=2,
        work_root=tmp_path / "w",
        results_root=tmp_path / "res",
        sitl_log_root=sitl,
        replay_params_path=tmp_path / "replay_params.txt",
        original_ulg=orig,
        container_ulg=CONTAINER_ULG,
    )


def test_success_attaches_into_open_experiment(tmp_path, monkeypatch):
    _setup_experiment(tmp_path, monkeypatch)
    orig = _orig(tmp_path)
    sitl = tmp_path / "sitl"
    sitl.mkdir()
    params = tmp_path / "replay_params.txt"
    seen = []
    rebuilt = []

    def runner(argv):
        seen.append(argv)
        (sitl / "x_replayed.ulg").write_bytes(b"r")
        return subprocess.CompletedProcess(argv, 0, "ok", "")

    job = start_replay(
        "r1",
        {"EKF2_X": 1},
        work_root=tmp_path / "w",
        results_root=tmp_path / "res",
        sitl_log_root=sitl,
        replay_params_path=params,
        original_ulg=orig,
        container_ulg=CONTAINER_ULG,
        slug="S",
        parent_id=2,
        runner=runner,
        rebuild=lambda slug: rebuilt.append(slug) or {"ok": True},
    )
    assert seen[0] == build_replay_argv(CONTAINER_ULG)
    assert params.read_text() == "EKF2_X 1\n"
    assert job["status"] == "success"
    assert job["replay_id"] == "2_r1"
    assert "ea_slug" not in job
    assert rebuilt == ["S"]
    dest = tmp_path / "S" / "raw" / "drone_2_r1" / "replayed_r1.ulg"
    assert dest.is_file()
    assert dest.read_bytes() == b"r"
    slugs = [
        p.name
        for p in tmp_path.iterdir()
        if p.is_dir() and (p / "manifest.json").is_file()
    ]
    assert slugs == ["S"]
    manifest = load_manifest(tmp_path / "S" / "manifest.json")
    drone = next(d for d in manifest["drones"] if d["id"] == "2_r1")
    assert drone["kind"] == "replay"
    assert drone["parent_id"] == 2
    assert manifest["ui"]["visible_drone_ids"] == [2, "2_r1"]
    assert is_busy() is False
    stored = get_job("r1")
    assert stored["replay_id"] == "2_r1"
    assert stored["status"] == "success"


def test_nonzero_no_attach(tmp_path, monkeypatch):
    _setup_experiment(tmp_path, monkeypatch)
    orig = _orig(tmp_path)
    params = tmp_path / "replay_params.txt"
    start_replay(
        "r1",
        {},
        runner=lambda argv: subprocess.CompletedProcess(argv, 1, "boom", ""),
        rebuild=lambda slug: (_ for _ in ()).throw(AssertionError("no rebuild")),
        **_base_kw(tmp_path, orig),
    )
    assert params.read_bytes() == b""
    job = get_job("r1")
    assert job["status"] == "failed"
    assert job["replay_id"] is None
    assert not (tmp_path / "S" / "raw" / "drone_2_r1").exists()


def test_no_replayed_ulg_no_attach(tmp_path, monkeypatch):
    _setup_experiment(tmp_path, monkeypatch)
    start_replay(
        "r1",
        {},
        runner=lambda argv: subprocess.CompletedProcess(argv, 0, "ok", ""),
        rebuild=lambda slug: (_ for _ in ()).throw(AssertionError("no rebuild")),
        **_base_kw(tmp_path),
    )
    job = get_job("r1")
    assert job["status"] == "failed"
    assert job["replay_id"] is None
    assert not (tmp_path / "S" / "raw" / "drone_2_r1").exists()


def test_stop_during_runner_skips_attach(tmp_path, monkeypatch):
    _setup_experiment(tmp_path, monkeypatch)
    sitl = tmp_path / "sitl"
    sitl.mkdir()
    (sitl / "x_replayed.ulg").write_bytes(b"r")

    def runner(argv):
        request_stop("r1", killer=lambda pid: None)
        return subprocess.CompletedProcess(argv, 0, "ok", "")

    start_replay("r1", {}, runner=runner, **_base_kw(tmp_path))
    job = get_job("r1")
    assert job["status"] == "failed"
    assert job["error"] == "stopped"
    assert job["replay_id"] is None
    assert not (tmp_path / "S" / "raw" / "drone_2_r1").exists()


def test_busy_raises_and_skips_params(tmp_path, monkeypatch):
    _setup_experiment(tmp_path, monkeypatch)
    orig = _orig(tmp_path)
    testing_set_busy(True)
    try:
        with pytest.raises(BusyError):
            start_replay(
                "r1",
                {"EKF2_X": 1},
                runner=lambda argv: subprocess.CompletedProcess(argv, 0, "", ""),
                **_base_kw(tmp_path, orig),
            )
        assert not (tmp_path / "replay_params.txt").exists()
        assert not (tmp_path / "S" / "raw" / "drone_2_r1").exists()
    finally:
        testing_set_busy(False)


def test_second_claim_busy_raises(tmp_path, monkeypatch):
    _setup_experiment(tmp_path, monkeypatch)
    claim_busy()
    with pytest.raises(BusyError):
        claim_busy()
    with pytest.raises(BusyError):
        start_replay(
            "r1",
            {},
            runner=lambda argv: subprocess.CompletedProcess(argv, 0, "", ""),
            **_base_kw(tmp_path),
        )
    assert not (tmp_path / "S" / "raw" / "drone_2_r1").exists()


def test_container_ulg_must_be_under_experiment_analysis(tmp_path, monkeypatch):
    _setup_experiment(tmp_path, monkeypatch)
    orig = _orig(tmp_path)
    seen = []

    def runner(argv):
        seen.append(argv)
        return subprocess.CompletedProcess(argv, 0, "ok", "")

    job = start_replay(
        "r1",
        {},
        runner=runner,
        preflight=lambda: None,
        **{
            **_base_kw(tmp_path, orig),
            "container_ulg": "/home/valentin/PX4Replay/work/r1/input.ulg",
        },
    )
    assert seen == []
    assert job["status"] == "failed"
    assert "ExperimentAnalysis" in job["error"]
    assert job["replay_id"] is None


def test_rebuild_error_keeps_success_and_replay_id(tmp_path, monkeypatch):
    _setup_experiment(tmp_path, monkeypatch)
    kw = _base_kw(tmp_path)

    def boom(slug):
        raise RuntimeError("rebuild boom")

    def runner(argv):
        (kw["sitl_log_root"] / "x_replayed.ulg").write_bytes(b"r")
        return subprocess.CompletedProcess(argv, 0, "ok", "")

    job = start_replay(
        "r1",
        {"EKF2_X": 1},
        runner=runner,
        rebuild=boom,
        **kw,
    )
    assert job["status"] == "success"
    assert job["replay_id"] == "2_r1"
    assert (tmp_path / "S" / "raw" / "drone_2_r1" / "replayed_r1.ulg").is_file()
    assert is_busy() is False


def test_runner_exception_marks_failed_not_running(tmp_path, monkeypatch):
    _setup_experiment(tmp_path, monkeypatch)

    def runner(argv):
        raise RuntimeError("explode")

    job = start_replay("r1", {}, runner=runner, **_base_kw(tmp_path))
    assert job["status"] == "failed"
    assert "explode" in job["error"]
    assert get_job("r1")["status"] == "failed"
    assert get_job("r1")["replay_id"] is None
    assert is_busy() is False
    assert not (tmp_path / "S" / "raw" / "drone_2_r1").exists()


def test_stderr_included_in_error_and_px4_log(tmp_path, monkeypatch):
    _setup_experiment(tmp_path, monkeypatch)
    kw = _base_kw(tmp_path)
    start_replay(
        "r1",
        {},
        runner=lambda argv: subprocess.CompletedProcess(argv, 1, "out-part", "err-part"),
        **kw,
    )
    job = get_job("r1")
    assert job["status"] == "failed"
    assert "err-part" in job["error"]
    log = (tmp_path / "res" / "r1" / "px4.log").read_text()
    assert "out-part" in log
    assert "err-part" in log


def test_popen_stores_pid_stop_skips_attach_busy_until_exit(tmp_path, monkeypatch):
    _setup_experiment(tmp_path, monkeypatch)
    sitl = tmp_path / "sitl"
    sitl.mkdir()
    (sitl / "x_replayed.ulg").write_bytes(b"r")
    started = threading.Event()
    released = threading.Event()
    killed = []

    class FakePopen:
        pid = 4242
        returncode = None

        def communicate(self):
            started.set()
            assert released.wait(timeout=5)
            self.returncode = 0
            return ("ok", None)

    def factory(argv):
        return FakePopen()

    done = {}

    def run():
        done["job"] = start_replay(
            "r1",
            {},
            runner=None,
            popen_factory=factory,
            preflight=lambda: None,
            **_base_kw(tmp_path),
        )

    t = threading.Thread(target=run)
    t.start()
    assert started.wait(timeout=5)
    assert get_job("r1")["pid"] == 4242
    assert is_busy() is True
    request_stop("r1", killer=lambda pid: killed.append(pid))
    assert killed == [4242]
    assert is_busy() is True
    released.set()
    t.join(timeout=5)
    assert t.is_alive() is False
    assert is_busy() is False
    job = get_job("r1")
    assert job["status"] == "failed"
    assert job["error"] == "stopped"
    assert job["replay_id"] is None
    assert not (tmp_path / "S" / "raw" / "drone_2_r1").exists()


def test_preflight_container_missing_skips_params_and_make(tmp_path, monkeypatch):
    _setup_experiment(tmp_path, monkeypatch)
    ran = []

    def preflight():
        raise RuntimeError(
            "container dockerfiles_firm-px4-noetic-firm-1 missing; "
            "recreate compose with the new volume"
        )

    job = start_replay(
        "r1",
        {"EKF2_A": 1},
        runner=lambda argv: ran.append(argv)
        or subprocess.CompletedProcess(argv, 0, "", ""),
        preflight=preflight,
        **_base_kw(tmp_path),
    )
    assert job["status"] == "failed"
    assert "dockerfiles_firm-px4-noetic-firm-1" in job["error"]
    assert "recreate compose" in job["error"]
    assert not (tmp_path / "replay_params.txt").exists()
    assert ran == []
    assert job["replay_id"] is None


def test_preflight_mount_missing_skips_params(tmp_path, monkeypatch):
    _setup_experiment(tmp_path, monkeypatch)
    job = start_replay(
        "r1",
        {},
        runner=lambda argv: subprocess.CompletedProcess(argv, 0, "", ""),
        preflight=lambda: (_ for _ in ()).throw(
            RuntimeError(
                "/home/valentin/ExperimentAnalysis is not mounted in "
                "dockerfiles_firm-px4-noetic-firm-1; recreate compose with the new volume"
            )
        ),
        **_base_kw(tmp_path),
    )
    assert job["status"] == "failed"
    assert "/home/valentin/ExperimentAnalysis" in job["error"]
    assert "dockerfiles_firm-px4-noetic-firm-1" in job["error"]
    assert "recreate compose" in job["error"]
    assert not (tmp_path / "replay_params.txt").exists()
    assert job["replay_id"] is None


def test_default_preflight_before_params_when_runner_none(tmp_path, monkeypatch):
    _setup_experiment(tmp_path, monkeypatch)
    runs = []

    def fake_run(argv, **kwargs):
        runs.append(list(argv))
        return subprocess.CompletedProcess(argv, 1, "", "Error: No such object")

    monkeypatch.setattr("ea.replay.replay_job.subprocess.run", fake_run)

    def boom_popen(*args, **kwargs):
        raise AssertionError("popen must not run")

    monkeypatch.setattr("ea.replay.replay_job.subprocess.Popen", boom_popen)
    job = start_replay("r1", {"EKF2_A": 1}, runner=None, **_base_kw(tmp_path))
    assert job["status"] == "failed"
    assert "dockerfiles_firm-px4-noetic-firm-1" in job["error"]
    assert "recreate compose" in job["error"]
    assert not (tmp_path / "replay_params.txt").exists()
    assert runs
    assert "docker" in runs[0]
    inspect = runs[0]
    assert inspect[:2] == ["docker", "inspect"]


def test_default_popen_start_new_session_merges_stderr(monkeypatch):
    from ea.replay.replay_job import _default_popen

    seen = {}

    class Fake:
        pid = 1
        returncode = 0

        def __init__(self, *args, **kwargs):
            seen["kwargs"] = kwargs

        def communicate(self):
            return ("", None)

    monkeypatch.setattr("ea.replay.replay_job.subprocess.Popen", Fake)
    _default_popen(["true"])
    assert seen["kwargs"]["start_new_session"] is True
    assert seen["kwargs"]["stderr"] == subprocess.STDOUT


def test_stale_replayed_ulg_not_attached(tmp_path, monkeypatch):
    _setup_experiment(tmp_path, monkeypatch)
    sitl = tmp_path / "sitl"
    sitl.mkdir()
    stale = sitl / "old_replayed.ulg"
    stale.write_bytes(b"old")
    os.utime(stale, (1, 1))
    start_replay(
        "r1",
        {},
        runner=lambda argv: subprocess.CompletedProcess(argv, 0, "ok", ""),
        rebuild=lambda slug: (_ for _ in ()).throw(AssertionError("no rebuild")),
        **_base_kw(tmp_path),
    )
    job = get_job("r1")
    assert job["status"] == "failed"
    assert job["error"] == "no replayed ulg"
    assert job["replay_id"] is None
    assert not (tmp_path / "S" / "raw" / "drone_2_r1").exists()


def test_request_stop_on_success_does_not_kill_or_rewrite():
    killed = []
    testing_put_running("r1", pid=99)
    job = get_job("r1")
    job["status"] = "success"
    job["replay_id"] = "2_r1"
    request_stop("r1", killer=lambda pid: killed.append(pid))
    assert killed == []
    assert get_job("r1")["status"] == "success"
    assert get_job("r1")["replay_id"] == "2_r1"
    assert get_job("r1")["error"] is None


def test_request_stop_on_failed_does_not_kill_or_rewrite():
    killed = []
    testing_put_running("r1", pid=99)
    job = get_job("r1")
    job["status"] = "failed"
    job["error"] = "no replayed ulg"
    request_stop("r1", killer=lambda pid: killed.append(pid))
    assert killed == []
    assert get_job("r1")["status"] == "failed"
    assert get_job("r1")["error"] == "no replayed ulg"


def test_pid_cleared_when_child_exits(tmp_path, monkeypatch):
    _setup_experiment(tmp_path, monkeypatch)
    sitl = tmp_path / "sitl"
    sitl.mkdir()

    class FakePopen:
        pid = 4242
        returncode = 0

        def communicate(self):
            (sitl / "x_replayed.ulg").write_bytes(b"r")
            return ("ok", None)

    start_replay(
        "r1",
        {},
        runner=None,
        popen_factory=lambda argv: FakePopen(),
        preflight=lambda: None,
        rebuild=lambda slug: {"ok": True},
        **_base_kw(tmp_path),
    )
    stored = get_job("r1")
    assert stored["status"] == "success"
    assert stored["pid"] is None


def test_stop_kills_pid():
    killed = []
    testing_put_running("r1", pid=4242)
    request_stop("r1", killer=lambda pid: killed.append(pid))
    assert killed == [4242]
    assert get_job("r1")["status"] == "failed"
    assert get_job("r1")["error"] == "stopped"
    assert get_job("r1")["replay_id"] is None


def test_unknown_run_id_raises_keyerror():
    with pytest.raises(KeyError):
        request_stop("missing", killer=lambda pid: None)


def test_stop_without_pid_marks_stopped_no_killer():
    testing_put_running("r1", pid=None)
    request_stop(
        "r1", killer=lambda pid: (_ for _ in ()).throw(AssertionError("no kill"))
    )
    assert get_job("r1")["status"] == "failed"
    assert get_job("r1")["error"] == "stopped"
    assert get_job("r1")["replay_id"] is None
