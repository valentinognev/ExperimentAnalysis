import time
from pathlib import Path

from pymavlink import mavutil

from ea.ingest_files import _dest_path
from ea.manifest import save_manifest
from ea.store import open_experiment

TARGET_SYSTEM = 1
TARGET_COMPONENT = 1
CHUNK_SIZE = 90
LIST_TIMEOUT_S = 5.0
DATA_TIMEOUT_S = 30.0


def _mavlink_url(drone: dict) -> str | None:
    mavlink = drone.get("mavlink", {})
    url = mavlink.get("url")
    if url:
        return url
    host = drone.get("ssh", {}).get("host") or ""
    if host:
        return f"tcp:{host}:5760"
    return None


def _collect_log_entries(conn, timeout: float) -> list:
    conn.mav.log_request_list_send(TARGET_SYSTEM, TARGET_COMPONENT, 0, 0xFFFF)
    entries = []
    seen: set[int] = set()
    deadline = time.monotonic() + timeout
    idle_rounds = 0
    while time.monotonic() < deadline:
        msg = conn.recv_match(type="LOG_ENTRY", blocking=True, timeout=1.0)
        if msg is None:
            idle_rounds += 1
            if entries and idle_rounds >= 1:
                break
            if not entries and idle_rounds >= 2:
                break
            continue
        idle_rounds = 0
        if msg.id in seen:
            break
        seen.add(msg.id)
        entries.append(msg)
    return entries


def _download_log(conn, entry, timeout: float) -> bytes:
    log_id = entry.id
    size = entry.size
    data = bytearray()
    offset = 0
    deadline = time.monotonic() + timeout
    while offset < size and time.monotonic() < deadline:
        count = min(CHUNK_SIZE, size - offset)
        conn.mav.log_request_data_send(
            TARGET_SYSTEM, TARGET_COMPONENT, log_id, offset, count
        )
        msg = conn.recv_match(type="LOG_DATA", blocking=True, timeout=1.0)
        if msg is None or msg.id != log_id:
            raise TimeoutError("log data timeout")
        chunk = bytes(msg.data[: msg.count])
        if not chunk:
            break
        data.extend(chunk)
        offset += len(chunk)
    if len(data) < size:
        raise TimeoutError("incomplete log download")
    return bytes(data)


def _update_manifest_ulg(
    manifest: dict,
    drone_id: int,
    exp_path: Path,
    rel_path: str,
) -> None:
    for drone in manifest.get("drones", []):
        if drone["id"] == drone_id:
            sources = drone.setdefault("sources", {})
            ulg_list = sources.setdefault("ulg", [])
            if rel_path not in ulg_list:
                ulg_list.append(rel_path)
            break


def mavlink_pull(slug: str, drone_id: int, connect=mavutil.mavlink_connection) -> dict:
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

    url = _mavlink_url(drone)
    if not url:
        return {"ok": False, "error": "mavlink url not configured"}

    conn = None
    try:
        conn = connect(url)
        entries = _collect_log_entries(conn, LIST_TIMEOUT_S)
        if not entries:
            return {"ok": False, "error": "no logs on vehicle"}

        latest = max(entries, key=lambda e: e.id)
        ulg_bytes = _download_log(conn, latest, DATA_TIMEOUT_S)

        dest_dir = exp_path / "raw" / f"drone_{drone_id}"
        dest_dir.mkdir(parents=True, exist_ok=True)
        filename = f"log_{latest.id}_{latest.time_utc}.ulg"
        dest = _dest_path(dest_dir, filename)
        dest.write_bytes(ulg_bytes)

        rel = dest.relative_to(exp_path).as_posix()
        _update_manifest_ulg(manifest, drone_id, exp_path, rel)
        save_manifest(manifest_path, manifest)
        return {"ok": True}
    except TimeoutError:
        return {"ok": False, "error": "mavlink timeout"}
    except OSError as e:
        return {"ok": False, "error": str(e)}
    finally:
        if conn is not None:
            conn.close()
