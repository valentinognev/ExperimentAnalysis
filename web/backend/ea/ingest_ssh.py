import re
import subprocess
from pathlib import Path

from ea.store import open_experiment
from ea.manifest import save_manifest

SSH_TIMEOUT = 30
SM_CANDIDATES = (
    "~/RL/CatSwarm/system_manager/logs/",
    "~/RL/system_manager/logs/",
)
HA_CANDIDATES = (
    "~/RL/CatSwarm/hardware_adapter/logs/",
    "~/RL/CatSwarm/logs/",
    "~/RL/hardware_adapter/logs/",
    "~/RL/logs/",
    "~/RL/hardware_adapter/test_logs/",
)
ALL_CANDIDATES = SM_CANDIDATES + HA_CANDIDATES

_LIST_LINE = re.compile(
    r"^[-d][rwxsStT-]{9}\s+([\d,]+)\s+(\d{4}/\d{2}/\d{2})\s+(\d{2}:\d{2}:\d{2})\s+(.+)$"
)


def _redact_password(text: str, password: str | None) -> str:
    if not password or not text:
        return text
    return text.replace(password, "***")


def _ssh_e() -> str:
    return "ssh -o PreferredAuthentications=publickey -o StrictHostKeyChecking=no"


def _rsync_list_cmd(user: str, host: str, remote: str) -> list[str]:
    return [
        "rsync",
        "-a",
        "-e",
        _ssh_e(),
        "--list-only",
        f"{user}@{host}:{remote}",
    ]


def _rsync_file_cmd(
    user: str,
    host: str,
    remote_file: str,
    dest_dir: Path,
    progress: bool = False,
) -> list[str]:
    cmd = ["rsync", "-a"]
    if progress:
        cmd.extend(["--info=progress2", "--outbuf=L"])
    cmd.extend(
        [
            "-e",
            _ssh_e(),
            f"{user}@{host}:{remote_file}",
            f"{dest_dir}/",
        ]
    )
    return cmd


_PROGRESS = re.compile(r"([\d,]+)\s+(\d+)%")
COPY_TIMEOUT = 300


def parse_rsync_progress(line: str) -> tuple[int, int] | None:
    match = _PROGRESS.search(line or "")
    if not match:
        return None
    return int(match.group(1).replace(",", "")), int(match.group(2))


def _missing_remote_dir(stderr: str) -> bool:
    text = (stderr or "").lower()
    return "no such file or directory" in text and "change_dir" in text


def _file_kind(name: str) -> str | None:
    n = name.lower()
    if "system_manager" in n and n.endswith(".csv"):
        return "sm"
    if "adapter_diag" in n and n.endswith(".log"):
        return "ha"
    if "mavlink" in n and n.endswith((".txt", ".log")):
        return "ha"
    return None


def _parse_rsync_list(stdout: str, remote_dir: str) -> list[dict]:
    base = remote_dir.rstrip("/") + "/"
    entries: list[dict] = []
    for raw in (stdout or "").splitlines():
        match = _LIST_LINE.match(raw.strip())
        if not match:
            continue
        size_s, day, clock, name = match.groups()
        name = name.strip()
        if not name or name in (".", "..") or "/" in name:
            continue
        kind = _file_kind(name)
        if kind is None:
            continue
        entries.append(
            {
                "kind": kind,
                "name": name,
                "remote": f"{base}{name}",
                "size": int(size_s.replace(",", "")),
                "mtime": f"{day} {clock}",
            }
        )
    return entries


def _allowed_file_remote(remote: str) -> bool:
    if not remote or ".." in remote:
        return False
    for prefix in ALL_CANDIDATES:
        base = prefix.rstrip("/") + "/"
        if remote.startswith(base):
            rest = remote[len(base) :]
            return bool(rest) and "/" not in rest
    return False


def _sm_csv_paths(drone_dir: Path) -> list[Path]:
    return sorted(
        p for p in drone_dir.glob("*.csv")
        if "system_manager" in p.name.lower()
    )


def _prefer_sm_files(paths: list[Path], drone_id: int) -> list[Path]:
    needle = f"_d{drone_id}"
    preferred = [p for p in paths if needle in p.name.lower()]
    return preferred if preferred else paths


def _ha_paths(drone_dir: Path) -> list[Path]:
    paths: list[Path] = []
    if not drone_dir.is_dir():
        return paths
    for path in sorted(drone_dir.iterdir()):
        if not path.is_file():
            continue
        name = path.name.lower()
        if "adapter_diag" in name and name.endswith(".log"):
            paths.append(path)
        elif "mavlink" in name and name.endswith((".txt", ".log")):
            paths.append(path)
    return paths


def _update_manifest_sources(
    manifest: dict,
    drone_id: int,
    exp_path: Path,
    dest_dir: Path,
    copied_paths: list[Path] | None = None,
) -> None:
    drone = None
    for entry in manifest.get("drones", []):
        if entry["id"] == drone_id:
            drone = entry
            break
    if drone is None:
        return

    sources = drone.setdefault("sources", {})

    if copied_paths is not None:
        sm_copied = [
            p for p in copied_paths if p.is_file() and _file_kind(p.name) == "sm"
        ]
        ha_copied = [
            p for p in copied_paths if p.is_file() and _file_kind(p.name) == "ha"
        ]
        if sm_copied:
            sources["system_manager"] = [
                p.relative_to(exp_path).as_posix() for p in sm_copied
            ]
        if ha_copied:
            sources["hardware_adapter"] = [
                p.relative_to(exp_path).as_posix() for p in ha_copied
            ]
        return

    sm_list = sources.setdefault("system_manager", [])
    ha_list = sources.setdefault("hardware_adapter", [])

    sm_paths = _prefer_sm_files(_sm_csv_paths(dest_dir), drone_id)
    for path in sm_paths:
        rel = path.relative_to(exp_path).as_posix()
        if rel not in sm_list:
            sm_list.append(rel)

    for path in _ha_paths(dest_dir):
        rel = path.relative_to(exp_path).as_posix()
        if rel not in ha_list:
            ha_list.append(rel)


def _find_drone(manifest: dict, drone_id: int) -> dict | None:
    for entry in manifest.get("drones", []):
        if entry["id"] == drone_id:
            return entry
    return None


def _ssh_target(slug: str, drone_id: int) -> tuple[dict | None, dict | None, str | None]:
    try:
        result = open_experiment(slug)
    except FileNotFoundError:
        return None, None, "experiment not found"
    drone = _find_drone(result["manifest"], drone_id)
    if drone is None:
        return None, None, f"drone {drone_id} not found"
    host = (drone.get("ssh") or {}).get("host") or ""
    if not host:
        return None, None, "ssh host not configured"
    return result, drone, None


def _run(runner, cmd: list[str], password: str | None):
    try:
        proc = runner(cmd, capture_output=True, text=True, timeout=SSH_TIMEOUT)
    except subprocess.TimeoutExpired:
        return None, "ssh timeout"
    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or "rsync failed").strip()
        if _missing_remote_dir(err):
            return "missing", None
        return None, _redact_password(err, password)
    return proc, None


def ssh_list_logs(slug: str, drone_id: int, runner=subprocess.run) -> dict:
    opened, drone, err = _ssh_target(slug, drone_id)
    if err:
        return {"ok": False, "error": err}

    ssh = drone.get("ssh") or {}
    user = ssh.get("user") or "pi"
    host = ssh.get("host") or ""
    password = ssh.get("password")

    logs: list[dict] = []
    for remote in ALL_CANDIDATES:
        cmd = _rsync_list_cmd(user, host, remote)
        proc, run_err = _run(runner, cmd, password)
        if run_err:
            return {"ok": False, "error": run_err}
        if proc == "missing" or proc is None:
            continue
        logs.extend(_parse_rsync_list(proc.stdout or "", remote))

    logs.sort(key=lambda e: e["mtime"], reverse=True)
    if not logs:
        return {"ok": False, "error": "no logs on pi"}
    return {"ok": True, "logs": logs}


def _rsync_popen_progress(cmd, dest_path: Path, popen, cancel_check, password: str | None):
    proc = popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=0,
    )
    stdout = proc.stdout
    buf = ""
    while True:
        if cancel_check and cancel_check():
            proc.kill()
            try:
                proc.wait(timeout=5)
            except Exception:
                pass
            if dest_path.exists():
                dest_path.unlink()
            yield {"_status": "cancelled"}
            return
        ch = stdout.read(1) if stdout is not None else ""
        if not ch:
            break
        if ch in "\r\n":
            parsed = parse_rsync_progress(buf)
            if parsed:
                yield {"bytes": parsed[0], "pct": parsed[1]}
            buf = ""
        else:
            buf += ch
    parsed = parse_rsync_progress(buf)
    if parsed:
        yield {"bytes": parsed[0], "pct": parsed[1]}
    try:
        proc.wait(timeout=COPY_TIMEOUT)
    except subprocess.TimeoutExpired:
        proc.kill()
        yield {"_status": "error", "error": "ssh timeout"}
        return
    if proc.returncode != 0:
        err = "rsync failed"
        yield {"_status": "error", "error": _redact_password(err, password)}
        return
    yield {"_status": "ok"}


def ssh_copy_events(
    slug: str,
    drone_id: int,
    files: list[dict],
    runner=subprocess.run,
    popen=None,
    cancel_check=None,
):
    opened, drone, err = _ssh_target(slug, drone_id)
    if err:
        yield {"event": "error", "ok": False, "error": err}
        return
    if not files:
        yield {"event": "error", "ok": False, "error": "no files selected"}
        return

    ssh = drone.get("ssh") or {}
    user = ssh.get("user") or "pi"
    host = ssh.get("host") or ""
    password = ssh.get("password")

    exp_path = opened["path"]
    dest_dir = exp_path / "raw" / f"drone_{drone_id}"
    dest_dir.mkdir(parents=True, exist_ok=True)
    use_popen = runner is subprocess.run
    count = len(files)
    copied = 0
    copied_paths: list[Path] = []

    for index, item in enumerate(files, 1):
        if cancel_check and cancel_check():
            yield {"event": "cancelled", "ok": False, "error": "cancelled"}
            return
        remote = (item.get("remote") or "").strip()
        name = (item.get("name") or Path(remote).name).strip()
        if not _allowed_file_remote(remote):
            yield {"event": "error", "ok": False, "error": "remote path not allowed"}
            return
        if name != Path(remote).name:
            yield {"event": "error", "ok": False, "error": "remote path not allowed"}
            return
        total = int(item.get("size") or 0)
        dest_path = dest_dir / name
        yield {
            "event": "progress",
            "name": name,
            "index": index,
            "count": count,
            "bytes": 0,
            "total": total,
            "pct": 0,
        }
        if use_popen:
            cmd = _rsync_file_cmd(user, host, remote, dest_dir, progress=True)
            status = None
            last_err = "rsync failed"
            for piece in _rsync_popen_progress(
                cmd, dest_path, popen or subprocess.Popen, cancel_check, password
            ):
                if piece.get("_status"):
                    status = piece["_status"]
                    last_err = piece.get("error") or last_err
                    break
                pct = int(piece.get("pct") or 0)
                yield {
                    "event": "progress",
                    "name": name,
                    "index": index,
                    "count": count,
                    "bytes": int(piece.get("bytes") or 0),
                    "total": total,
                    "pct": pct,
                }
            if status == "cancelled":
                yield {"event": "cancelled", "ok": False, "error": "cancelled"}
                return
            if status != "ok":
                yield {"event": "error", "ok": False, "error": last_err}
                return
        else:
            cmd = _rsync_file_cmd(user, host, remote, dest_dir)
            proc, run_err = _run(runner, cmd, password)
            if run_err:
                yield {"event": "error", "ok": False, "error": run_err}
                return
            if proc == "missing" or proc is None:
                yield {
                    "event": "error",
                    "ok": False,
                    "error": f"missing remote file: {name}",
                }
                return
        yield {
            "event": "progress",
            "name": name,
            "index": index,
            "count": count,
            "bytes": total,
            "total": total,
            "pct": 100,
        }
        copied += 1
        copied_paths.append(dest_path)

    if copied == 0:
        yield {"event": "error", "ok": False, "error": "no files selected"}
        return

    _update_manifest_sources(
        opened["manifest"], drone_id, exp_path, dest_dir, copied_paths=copied_paths
    )
    save_manifest(exp_path / "manifest.json", opened["manifest"])
    yield {"event": "done", "ok": True}


def ssh_copy_logs(
    slug: str,
    drone_id: int,
    files: list[dict],
    runner=subprocess.run,
    popen=None,
    cancel_check=None,
) -> dict:
    last = {"ok": False, "error": "copy failed"}
    for event in ssh_copy_events(
        slug,
        drone_id,
        files,
        runner=runner,
        popen=popen,
        cancel_check=cancel_check,
    ):
        last = event
    if last.get("event") == "done" and last.get("ok"):
        return {"ok": True}
    if last.get("event") == "cancelled":
        return {"ok": False, "error": "cancelled"}
    return {"ok": False, "error": last.get("error") or "copy failed"}


def ssh_pull(slug: str, drone_id: int, runner=subprocess.run) -> dict:
    opened, drone, err = _ssh_target(slug, drone_id)
    if err:
        return {"ok": False, "error": err}

    dest_dir = opened["path"] / "raw" / f"drone_{drone_id}"
    dest_dir.mkdir(parents=True, exist_ok=True)
    already = bool(_sm_csv_paths(dest_dir) or _ha_paths(dest_dir))

    listed = ssh_list_logs(slug, drone_id, runner=runner)
    if listed.get("ok") and listed.get("logs"):
        return ssh_copy_logs(slug, drone_id, listed["logs"], runner=runner)

    err_text = (listed.get("error") or "").lower()
    if already and ("no logs" in err_text or "empty" in err_text):
        _update_manifest_sources(
            opened["manifest"], drone_id, opened["path"], dest_dir
        )
        save_manifest(opened["path"] / "manifest.json", opened["manifest"])
        return {"ok": True}
    if not listed.get("ok") and "no logs" in err_text:
        return {"ok": False, "error": "empty remote dir"}
    return listed
