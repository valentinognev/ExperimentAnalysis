import subprocess
from pathlib import Path

from ea.store import open_experiment
from ea.manifest import save_manifest

SSH_TIMEOUT = 30
SM_REMOTE = "~/RL/system_manager/logs/"
HA_REMOTE = "~/RL/hardware_adapter/logs/"


def _redact_password(text: str, password: str | None) -> str:
    if not password or not text:
        return text
    return text.replace(password, "***")


def _rsync_cmd(user: str, host: str, remote: str, dest_dir: Path) -> list[str]:
    ssh_e = "ssh -o PreferredAuthentications=publickey -o StrictHostKeyChecking=no"
    return [
        "rsync",
        "-a",
        "-e",
        ssh_e,
        f"{user}@{host}:{remote}",
        f"{dest_dir}/",
    ]


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
) -> None:
    drone = None
    for entry in manifest.get("drones", []):
        if entry["id"] == drone_id:
            drone = entry
            break
    if drone is None:
        return

    sources = drone.setdefault("sources", {})
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


def ssh_pull(slug: str, drone_id: int, runner=subprocess.run) -> dict:
    result = open_experiment(slug)
    exp_path = result["path"]
    manifest = result["manifest"]
    manifest_path = exp_path / "manifest.json"

    drone = None
    for entry in manifest.get("drones", []):
        if entry["id"] == drone_id:
            drone = entry
            break
    if drone is None:
        return {"ok": False, "error": f"drone {drone_id} not found"}

    ssh = drone.get("ssh", {})
    user = ssh.get("user") or "pi"
    host = ssh.get("host") or ""
    password = ssh.get("password")

    if not host:
        return {"ok": False, "error": "ssh host not configured"}

    dest_dir = exp_path / "raw" / f"drone_{drone_id}"
    dest_dir.mkdir(parents=True, exist_ok=True)
    for remote in (SM_REMOTE, HA_REMOTE):
        cmd = _rsync_cmd(user, host, remote, dest_dir)
        try:
            proc = runner(cmd, capture_output=True, text=True, timeout=SSH_TIMEOUT)
        except subprocess.TimeoutExpired:
            return {"ok": False, "error": "ssh timeout"}
        if proc.returncode != 0:
            err = (proc.stderr or proc.stdout or "rsync failed").strip()
            return {"ok": False, "error": _redact_password(err, password)}

    after = {p for p in dest_dir.iterdir() if p.is_file()}
    if not after:
        return {"ok": False, "error": "empty remote dir"}

    _update_manifest_sources(manifest, drone_id, exp_path, dest_dir)
    save_manifest(manifest_path, manifest)
    return {"ok": True}
