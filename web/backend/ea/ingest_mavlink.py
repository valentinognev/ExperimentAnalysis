import queue
import threading
import time
from pathlib import Path

from pymavlink import mavutil

from ea.manifest import save_manifest
from ea.store import open_experiment

TARGET_SYSTEM = 1
TARGET_COMPONENT = 1
CHUNK_SIZE = 90
LIST_TIMEOUT_S = 5.0
DATA_TIMEOUT_S = 30.0
SERIAL_DEFAULT = "/dev/ttyUSB0"
SERIAL_BAUD = 57600


class TransferCancelled(Exception):
    pass


def _mavlink_url(drone: dict) -> str | None:
    mavlink = drone.get("mavlink", {})
    url = mavlink.get("url")
    if url:
        return url
    host = drone.get("ssh", {}).get("host") or ""
    if host:
        return f"tcp:{host}:5760"
    return None


def _find_drone(manifest: dict, drone_id: int) -> dict | None:
    for entry in manifest.get("drones", []):
        if entry["id"] == drone_id:
            return entry
    return None


def _transport_target(
    drone: dict, transport: str, serial: str | None = None
) -> tuple[str | None, int | None, str | None]:
    if transport == "serial":
        mavlink = drone.get("mavlink") or {}
        device = (serial or mavlink.get("serial") or SERIAL_DEFAULT).strip()
        if not device:
            return None, None, "serial device not configured"
        baud = int(mavlink.get("baud") or SERIAL_BAUD)
        return device, baud, None
    if transport != "tcp":
        return None, None, f"unknown transport: {transport}"
    url = _mavlink_url(drone)
    if not url:
        return None, None, "mavlink url not configured"
    return url, None, None


def _open_conn(connect, url: str, baud: int | None):
    if baud is None:
        return connect(url)
    try:
        return connect(url, baud=baud)
    except TypeError:
        return connect(url)


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


def _serialize_entry(entry) -> dict:
    return {
        "id": int(entry.id),
        "time_utc": int(getattr(entry, "time_utc", 0) or 0),
        "size": int(entry.size),
    }


def _download_log(conn, entry, timeout: float, cancel_check=None, on_progress=None) -> bytes:
    log_id = entry.id
    size = entry.size
    data = bytearray()
    offset = 0
    deadline = time.monotonic() + timeout
    while offset < size and time.monotonic() < deadline:
        if cancel_check and cancel_check():
            raise TransferCancelled()
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
        if on_progress:
            on_progress(offset, size)
    if len(data) < size:
        raise TimeoutError("incomplete log download")
    return bytes(data)


def _ulg_files(dest_dir: Path) -> list[Path]:
    if not dest_dir.is_dir():
        return []
    return sorted(p for p in dest_dir.glob("*.ulg") if p.is_file())


def _write_single_ulg(
    exp_path: Path,
    dest_dir: Path,
    drone: dict,
    filename: str,
    payload: bytes,
) -> str:
    dest_dir.mkdir(parents=True, exist_ok=True)
    tmp = dest_dir / f".part_{filename}"
    tmp.write_bytes(payload)
    final = dest_dir / filename
    for old in _ulg_files(dest_dir):
        if old.resolve() != tmp.resolve():
            old.unlink()
    tmp.replace(final)
    rel = final.relative_to(exp_path).as_posix()
    sources = drone.setdefault("sources", {})
    sources["ulg"] = [rel]
    return rel


def mavlink_list_logs(
    slug: str,
    drone_id: int,
    transport: str = "tcp",
    serial: str | None = None,
    connect=mavutil.mavlink_connection,
) -> dict:
    try:
        result = open_experiment(slug)
    except FileNotFoundError:
        return {"ok": False, "error": "experiment not found"}

    drone = _find_drone(result["manifest"], drone_id)
    if drone is None:
        return {"ok": False, "error": f"drone {drone_id} not found"}

    url, baud, err = _transport_target(drone, transport, serial)
    if err:
        return {"ok": False, "error": err}

    conn = None
    try:
        conn = _open_conn(connect, url, baud)
        entries = _collect_log_entries(conn, LIST_TIMEOUT_S)
        if not entries:
            return {"ok": False, "error": "no logs on vehicle"}
        return {"ok": True, "logs": [_serialize_entry(e) for e in entries]}
    except TimeoutError:
        return {"ok": False, "error": "mavlink timeout"}
    except OSError as e:
        return {"ok": False, "error": str(e)}
    finally:
        if conn is not None:
            conn.close()


def mavlink_download_log(
    slug: str,
    drone_id: int,
    log_id: int,
    transport: str = "tcp",
    serial: str | None = None,
    confirm_replace: bool = False,
    connect=mavutil.mavlink_connection,
    cancel_check=None,
    on_progress=None,
) -> dict:
    try:
        result = open_experiment(slug)
    except FileNotFoundError:
        return {"ok": False, "error": "experiment not found"}

    exp_path = result["path"]
    manifest = result["manifest"]
    manifest_path = exp_path / "manifest.json"
    drone = _find_drone(manifest, drone_id)
    if drone is None:
        return {"ok": False, "error": f"drone {drone_id} not found"}

    dest_dir = exp_path / "raw" / f"drone_{drone_id}"
    existing = _ulg_files(dest_dir)
    if existing and not confirm_replace:
        rel = existing[0].relative_to(exp_path).as_posix()
        return {"ok": False, "needs_replace": True, "existing": rel}

    url, baud, err = _transport_target(drone, transport, serial)
    if err:
        return {"ok": False, "error": err}

    conn = None
    try:
        conn = _open_conn(connect, url, baud)
        entries = _collect_log_entries(conn, LIST_TIMEOUT_S)
        if not entries:
            return {"ok": False, "error": "no logs on vehicle"}
        entry = next((e for e in entries if int(e.id) == int(log_id)), None)
        if entry is None:
            return {"ok": False, "error": f"log {log_id} not found"}

        ulg_bytes = _download_log(
            conn,
            entry,
            DATA_TIMEOUT_S,
            cancel_check=cancel_check,
            on_progress=on_progress,
        )
        filename = f"log_{entry.id}_{entry.time_utc}.ulg"
        _write_single_ulg(exp_path, dest_dir, drone, filename, ulg_bytes)
        save_manifest(manifest_path, manifest)
        return {"ok": True}
    except TransferCancelled:
        return {"ok": False, "error": "cancelled", "cancelled": True}
    except TimeoutError:
        return {"ok": False, "error": "mavlink timeout"}
    except OSError as e:
        return {"ok": False, "error": str(e)}
    finally:
        if conn is not None:
            conn.close()


def mavlink_download_events(
    slug: str,
    drone_id: int,
    log_id: int,
    transport: str = "tcp",
    serial: str | None = None,
    confirm_replace: bool = False,
    connect=mavutil.mavlink_connection,
    cancel_check=None,
):
    work: queue.Queue = queue.Queue()

    def on_progress(got: int, total: int) -> None:
        pct = int(100 * got / total) if total else 100
        work.put(
            {
                "event": "progress",
                "name": f"log_{log_id}",
                "index": 1,
                "count": 1,
                "bytes": got,
                "total": total,
                "pct": pct,
            }
        )

    def worker() -> None:
        result = mavlink_download_log(
            slug,
            drone_id,
            log_id,
            transport=transport,
            serial=serial,
            confirm_replace=confirm_replace,
            connect=connect,
            cancel_check=cancel_check,
            on_progress=on_progress,
        )
        work.put({"_final": result})

    threading.Thread(target=worker, daemon=True).start()
    while True:
        item = work.get()
        if "_final" in item:
            result = item["_final"]
            if result.get("needs_replace"):
                yield {**result, "event": "needs_replace"}
            elif result.get("cancelled") or result.get("error") == "cancelled":
                yield {"event": "cancelled", "ok": False, "error": "cancelled"}
            elif result.get("ok"):
                yield {"event": "done", "ok": True}
            else:
                yield {
                    "event": "error",
                    "ok": False,
                    "error": result.get("error") or "download failed",
                }
            return
        yield item


def mavlink_pull(slug: str, drone_id: int, connect=mavutil.mavlink_connection) -> dict:
    listed = mavlink_list_logs(slug, drone_id, transport="tcp", connect=connect)
    if not listed.get("ok"):
        return listed
    latest = max(listed["logs"], key=lambda e: e["id"])
    return mavlink_download_log(
        slug,
        drone_id,
        log_id=latest["id"],
        transport="tcp",
        confirm_replace=True,
        connect=connect,
    )
