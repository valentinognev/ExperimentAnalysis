from __future__ import annotations

import os
import signal
import subprocess
import threading
from pathlib import Path
from typing import Callable

from ea.rebuild import rebuild as default_rebuild
from ea.replay.attach import attach_replay
from ea.replay.replay_argv import DOCKER_CONTAINER, build_replay_argv
from ea.replay.replay_params import write_replay_params
from ea.replay.results import collect_results

class BusyError(Exception):
    pass


_lock = threading.Lock()
_busy = False
_jobs: dict[str, dict] = {}

_CONTAINER_MOUNT = "/home/valentin/ExperimentAnalysis"


def is_busy() -> bool:
    return _busy


def testing_set_busy(flag: bool) -> None:
    global _busy
    _busy = bool(flag)


testing_set_busy.__test__ = False  # pytest: name starts with test*


def claim_busy() -> None:
    global _busy
    if _busy:
        raise BusyError("replay already running")
    if not _lock.acquire(blocking=False):
        raise BusyError("replay already running")
    _busy = True


def release_busy() -> None:
    global _busy
    _busy = False
    if _lock.locked():
        try:
            _lock.release()
        except RuntimeError:
            pass


def _empty_job(**fields) -> dict:
    job = {
        "status": None,
        "results_dir": None,
        "replayed_ulg": None,
        "replay_id": None,
        "error": None,
        "pid": None,
    }
    job.update(fields)
    return job


def testing_put_running(run_id: str, pid: int | None = None) -> None:
    _jobs[run_id] = _empty_job(status="running", pid=pid)


testing_put_running.__test__ = False


def request_stop(run_id: str, killer: Callable | None = None) -> None:
    if run_id not in _jobs:
        raise KeyError(run_id)
    job = _jobs[run_id]
    pid = job.get("pid")
    if pid is not None:
        kill_fn = _default_killer if killer is None else killer
        kill_fn(pid)
    job["status"] = "failed"
    job["error"] = "stopped"
    job["replay_id"] = None


def reset_jobs() -> None:
    global _jobs
    _jobs = {}
    testing_set_busy(False)
    if _lock.locked():
        _lock.release()


def get_job(run_id: str) -> dict | None:
    return _jobs.get(run_id)


def _default_killer(pid: int) -> None:
    try:
        os.killpg(pid, signal.SIGTERM)
    except OSError:
        pass


def _default_runner(argv: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(
        argv, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True
    )


def _default_popen(argv: list[str]) -> subprocess.Popen:
    return subprocess.Popen(
        argv,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        start_new_session=True,
    )


def _default_preflight(*, run: Callable | None = None) -> None:
    run_fn = subprocess.run if run is None else run
    inspect = run_fn(
        ["docker", "inspect", "-f", "{{.State.Running}}", DOCKER_CONTAINER],
        capture_output=True,
        text=True,
    )
    running = (inspect.stdout or "").strip().lower()
    if inspect.returncode != 0 or running not in {"true", "1"}:
        raise RuntimeError(
            f"container {DOCKER_CONTAINER} missing; recreate compose with the new volume"
        )
    mount = run_fn(
        ["docker", "exec", DOCKER_CONTAINER, "test", "-d", _CONTAINER_MOUNT],
        capture_output=True,
        text=True,
    )
    if mount.returncode != 0:
        raise RuntimeError(
            f"{_CONTAINER_MOUNT} is not mounted in {DOCKER_CONTAINER}; "
            "recreate compose with the new volume"
        )


def _combined_output(proc) -> str:
    out = proc.stdout if proc.stdout is not None else ""
    err = getattr(proc, "stderr", None) or ""
    return f"{out}{err}"


def start_replay(
    run_id: str,
    overrides: dict,
    *,
    slug,
    parent_id,
    work_root,
    results_root,
    sitl_log_root,
    replay_params_path,
    original_ulg: Path,
    container_ulg,
    runner: Callable | None = None,
    rebuild: Callable | None = None,
    popen_factory: Callable | None = None,
    preflight: Callable | None = None,
    claimed: bool = False,
) -> dict:
    if not claimed:
        claim_busy()
    rebuild_fn = default_rebuild if rebuild is None else rebuild
    job = _empty_job(status="running")
    _jobs[run_id] = job
    try:
        if preflight is not None:
            preflight()
        elif runner is None:
            _default_preflight()
        write_replay_params(Path(replay_params_path), overrides)
        argv = build_replay_argv(container_ulg)
        if runner is not None:
            proc = runner(argv)
            px4_log = _combined_output(proc)
            returncode = proc.returncode
        else:
            factory = _default_popen if popen_factory is None else popen_factory
            child = factory(argv)
            job["pid"] = getattr(child, "pid", None)
            stdout, stderr = child.communicate()
            px4_log = stdout if stdout is not None else ""
            if stderr:
                px4_log = f"{px4_log}{stderr}"
            returncode = child.returncode
        if job.get("error") == "stopped":
            return job
        collected = collect_results(
            run_id, Path(sitl_log_root), Path(results_root), px4_log
        )
        job["results_dir"] = collected["results_dir"]
        job["replayed_ulg"] = collected["replayed_ulg"]
        if returncode != 0 or not collected["ok"]:
            job["status"] = "failed"
            job["replay_id"] = None
            job["error"] = px4_log if returncode != 0 else "no replayed ulg"
            return job

        attached = attach_replay(
            slug,
            parent_id,
            run_id,
            Path(original_ulg),
            Path(collected["replayed_ulg"]),
            overrides,
        )
        job["replay_id"] = attached["replay_id"]
        try:
            rebuild_fn(slug)
        except Exception as exc:
            job["rebuild_error"] = str(exc)
        job["status"] = "success"
        return job
    except Exception as exc:
        job["status"] = "failed"
        job["error"] = str(exc)
        return job
    finally:
        release_busy()
