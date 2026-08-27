"""Rebuild derived parquet and sync from raw ulogs."""

from __future__ import annotations

from pathlib import Path

from ea.arm import ulog_arm_us
from ea.extract_ulog import extract_ulog
from ea.store import open_experiment
from ea.sync import write_sync

_EXTRA_TOPICS = ("actuator_armed",)


def rebuild(slug: str) -> dict:
    result = open_experiment(slug)
    exp_path = result["path"]
    raw_dir = exp_path / "raw"

    per_drone: dict = {}
    drones_out: dict = {}

    if raw_dir.is_dir():
        for drone_dir in sorted(raw_dir.glob("drone_*")):
            if not drone_dir.is_dir():
                continue
            drone_id = drone_dir.name.split("_", 1)[1]
            derived = exp_path / "derived" / f"drone_{drone_id}"

            extract_notes: list[dict] = []
            for ulg in sorted(drone_dir.glob("*.ulg")):
                written = extract_ulog(ulg, derived, extra_topics=_EXTRA_TOPICS)
                extract_notes.append({"file": ulg.name, "topics": written})

            status_path = derived / "vehicle_status.parquet"
            actuator_path = derived / "actuator_armed.parquet"
            arm_us = ulog_arm_us(
                status_path if status_path.is_file() else None,
                actuator_path if actuator_path.is_file() else None,
            )
            per_drone[drone_id] = {
                "ulog_arm_us": arm_us,
                "sm_arm_local_ts": None,
            }
            drones_out[drone_id] = {"extract": extract_notes}

    sync = write_sync(exp_path, per_drone)
    return {"ok": True, "drones": drones_out, "sync": sync}
