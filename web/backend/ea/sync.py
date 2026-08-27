"""Experiment time sync metadata and T mapping."""

from __future__ import annotations

import json
from pathlib import Path


def t_ulog(t_us: float, arm_us: int | None, first_us: int) -> float:
    if arm_us is not None:
        return (t_us - arm_us) / 1e6
    return (t_us - first_us) / 1e6


def t_sm(local_ts: float, arm_local: float | None, first_local: float) -> float:
    if arm_local is not None:
        return local_ts - arm_local
    return local_ts - first_local


def write_sync(experiment_dir: Path, per_drone: dict) -> dict:
    drones: dict[str, dict] = {}
    for drone_id, info in per_drone.items():
        ulog_arm_us = info.get("ulog_arm_us")
        drones[str(drone_id)] = {
            "ulog_arm_us": ulog_arm_us,
            "sm_arm_local_ts": info.get("sm_arm_local_ts"),
            "synced": ulog_arm_us is not None,
            "note": info.get("note", ""),
        }

    sync = {"mode": "arm", "drones": drones}
    dest = experiment_dir / "derived" / "sync.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    with open(dest, "w") as f:
        json.dump(sync, f, indent=2)
        f.write("\n")
    return sync
