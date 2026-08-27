"""Rebuild derived parquet and sync from raw ulogs."""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from ea.arm import sm_arm_local_ts, ulog_arm_us
from ea.extract_ha import extract_ha
from ea.extract_sm import extract_sm
from ea.extract_ulog import extract_ulog
from ea.store import open_experiment
from ea.duration import experiment_t_max_s
from ea.sync import write_sync

_EXTRA_TOPICS = ("actuator_armed",)


def _sm_csv_paths(drone_dir: Path) -> list[Path]:
    paths: list[Path] = []
    for csv in sorted(drone_dir.glob("*.csv")):
        if "system_manager" in csv.name.lower():
            paths.append(csv)
    return paths


def _ha_log_paths(drone_dir: Path) -> list[Path]:
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

            sm_notes: list[dict] = []
            sm_arm: float | None = None
            for csv in _sm_csv_paths(drone_dir):
                parquet = extract_sm(csv, derived)
                sm_notes.append({"file": csv.name, "parquet": parquet.name})
                if "system_manager" in csv.name.lower():
                    sm_arm = sm_arm_local_ts(pd.read_parquet(parquet))

            ha_derived = exp_path / "derived" / "ha" / f"drone_{drone_id}"
            ha_notes: list[dict] = []
            for log_path in _ha_log_paths(drone_dir):
                result = extract_ha(log_path, ha_derived)
                if result == "skipped":
                    ha_notes.append({"file": log_path.name, "status": "skipped"})
                else:
                    ha_notes.append({"file": log_path.name, "parquet": result.name})

            status_path = derived / "vehicle_status.parquet"
            actuator_path = derived / "actuator_armed.parquet"
            arm_us = ulog_arm_us(
                status_path if status_path.is_file() else None,
                actuator_path if actuator_path.is_file() else None,
            )
            per_drone[drone_id] = {
                "ulog_arm_us": arm_us,
                "sm_arm_local_ts": sm_arm,
            }
            drones_out[drone_id] = {
                "extract": extract_notes,
                "sm_extract": sm_notes,
                "ha_extract": ha_notes,
            }

    sync = write_sync(exp_path, per_drone)
    t_max_s = experiment_t_max_s(exp_path)
    sync["t_max_s"] = t_max_s
    sync_path = exp_path / "derived" / "sync.json"
    with open(sync_path, "w") as f:
        json.dump(sync, f, indent=2)
        f.write("\n")
    return {"ok": True, "drones": drones_out, "sync": sync, "t_max_s": t_max_s}
