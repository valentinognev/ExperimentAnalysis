"""Rebuild derived parquet and sync from raw ulogs."""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from ea.arm import sm_arm_local_ts, ulog_arm_us
from ea.extract_ha import extract_ha
from ea.extract_sm import extract_sm
from ea.extract_ulog import extract_ulog
from ea.replay_id import is_replay_id, parent_id
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


def _listed_source_files(exp_path: Path, rels: object, pred) -> list[Path]:
    if not isinstance(rels, list) or not rels:
        return []
    out: list[Path] = []
    for rel in rels:
        if not isinstance(rel, str):
            continue
        path = exp_path / rel
        if path.is_file() and pred(path):
            out.append(path)
    return out


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
    opened = open_experiment(slug)
    exp_path = opened["path"]
    raw_dir = exp_path / "raw"
    drones_by_id = {
        str(d.get("id")): d for d in opened["manifest"].get("drones", [])
    }

    per_drone: dict = {}
    drones_out: dict = {}

    if raw_dir.is_dir():
        for drone_dir in sorted(raw_dir.glob("drone_*")):
            if not drone_dir.is_dir():
                continue
            drone_id = drone_dir.name.split("_", 1)[1]
            derived = exp_path / "derived" / f"drone_{drone_id}"
            sources = (drones_by_id.get(drone_id) or {}).get("sources") or {}

            extract_notes: list[dict] = []
            for ulg in sorted(drone_dir.glob("*.ulg")):
                written = extract_ulog(ulg, derived, extra_topics=_EXTRA_TOPICS)
                extract_notes.append({"file": ulg.name, "topics": written})

            sm_notes: list[dict] = []
            sm_arm: float | None = None
            sm_csvs = _listed_source_files(
                exp_path,
                sources.get("system_manager"),
                lambda p: "system_manager" in p.name.lower() and p.suffix.lower() == ".csv",
            ) or _sm_csv_paths(drone_dir)
            for csv in sm_csvs:
                sm_out = extract_sm(csv, derived)
                if sm_out == "skipped":
                    sm_notes.append({"file": csv.name, "status": "skipped"})
                    continue
                sm_notes.append({"file": csv.name, "parquet": sm_out.name})
                if "system_manager" in csv.name.lower():
                    sm_arm = sm_arm_local_ts(pd.read_parquet(sm_out))

            ha_derived = exp_path / "derived" / "ha" / f"drone_{drone_id}"
            ha_notes: list[dict] = []
            ha_logs = _listed_source_files(
                exp_path,
                sources.get("hardware_adapter"),
                lambda p: (
                    ("adapter_diag" in p.name.lower() and p.suffix.lower() == ".log")
                    or (
                        "mavlink" in p.name.lower()
                        and p.suffix.lower() in (".txt", ".log")
                    )
                ),
            ) or _ha_log_paths(drone_dir)
            for log_path in ha_logs:
                ha_result = extract_ha(log_path, ha_derived)
                if ha_result == "skipped":
                    ha_notes.append({"file": log_path.name, "status": "skipped"})
                else:
                    ha_notes.append({"file": log_path.name, "parquet": ha_result.name})

            status_path = derived / "vehicle_status.parquet"
            actuator_path = derived / "actuator_armed.parquet"
            arm_us = ulog_arm_us(
                status_path if status_path.is_file() else None,
                actuator_path if actuator_path.is_file() else None,
            )
            if is_replay_id(drone_id):
                parent = parent_id(drone_id)
                parent_info = per_drone.get(str(parent), per_drone.get(parent))
                if parent_info is not None:
                    arm_us = parent_info.get("ulog_arm_us")
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
