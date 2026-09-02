"""Experiment timeline duration from derived sources."""

from __future__ import annotations

import json
import math
from pathlib import Path

import pandas as pd

from ea.manifest import load_manifest
from ea.sync import t_sm, t_ulog, time_mapping

_POSE_TOPICS = (
    "vehicle_local_position",
    "vehicle_attitude",
    "vehicle_gps_position",
    "vehicle_global_position",
)
_SM_PARQUET = "sm_system_manager.parquet"


def _read_sync(experiment_dir: Path) -> dict:
    sync_path = experiment_dir / "derived" / "sync.json"
    if not sync_path.is_file():
        return {}
    with open(sync_path) as f:
        data = json.load(f)
    return data.get("drones", {})


def _max_ulog_t(
    derived: Path, arm_us: int | None, offset_s: float
) -> float | None:
    best: float | None = None
    for topic in _POSE_TOPICS:
        path = derived / f"{topic}.parquet"
        if not path.is_file():
            continue
        df = pd.read_parquet(path, columns=["timestamp"])
        if df.empty:
            continue
        first_us = int(df["timestamp"].iloc[0])
        ts = [t_ulog(float(v), arm_us, first_us, offset_s) for v in df["timestamp"]]
        candidate = max(ts)
        if best is None or candidate > best:
            best = candidate
    return best


def _max_sm_t(
    derived: Path, sm_arm_local: float | None, offset_s: float
) -> float | None:
    path = derived / _SM_PARQUET
    if not path.is_file():
        return None
    df = pd.read_parquet(path, columns=["local_ts"])
    if df.empty:
        return None
    first_local = float(df["local_ts"].iloc[0])
    ts = [
        t_sm(float(v), sm_arm_local, first_local, offset_s) for v in df["local_ts"]
    ]
    return max(ts)


def _max_ha_t(ha_dir: Path, offset_s: float) -> float | None:
    if not ha_dir.is_dir():
        return None
    best: float | None = None
    for path in ha_dir.glob("*.parquet"):
        df = pd.read_parquet(path, columns=["timestamp"])
        if df.empty:
            continue
        first = float(df["timestamp"].iloc[0])
        ts = [float(v) - first + offset_s for v in df["timestamp"]]
        candidate = max(ts)
        if best is None or candidate > best:
            best = candidate
    return best


def experiment_t_max_s(experiment_dir: Path) -> float:
    """Max experiment time T (seconds) across synced derived sources."""
    manifest_path = experiment_dir / "manifest.json"
    if not manifest_path.is_file():
        return 0.0

    manifest = load_manifest(manifest_path)
    sync_drones = _read_sync(experiment_dir)
    drone_ids = [str(d["id"]) for d in manifest.get("drones", [])]

    max_t = 0.0
    for drone_id in drone_ids:
        sync_info = sync_drones.get(drone_id, {})
        arm_us, sm_arm, offset_s = time_mapping(manifest, sync_info, drone_id)
        derived = experiment_dir / "derived" / f"drone_{drone_id}"

        for candidate in (
            _max_ulog_t(derived, arm_us, offset_s),
            _max_sm_t(derived, sm_arm, offset_s),
            _max_ha_t(
                experiment_dir / "derived" / "ha" / f"drone_{drone_id}",
                offset_s,
            ),
        ):
            if candidate is not None and candidate > max_t:
                max_t = candidate

    return math.floor(max_t) if max_t > 0 else 0.0
