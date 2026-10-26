"""Hold-last mission command snapshot at an experiment time."""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import pandas as pd

MISSION_LABELS: tuple[str, ...] = (
    "NONE",
    "Formation NN",
    "Formation Classic",
    "Waypoint",
    "Velocity",
    "Circle",
    "Lissajous",
    "Tracker",
    "Section",
    "Spinning",
    "Sine Input",
    "Cylinder Homing",
)

_FLOAT_COLUMNS: tuple[tuple[str, str], ...] = (
    ("gs_goto_speed", "vmax"),
    ("gs_takeoff_altitude", "altitude_m"),
    ("gs_takeoff_delta", "delta_m"),
    ("gs_formation_radius", "radius_m"),
    ("gs_formation_heading", "heading_deg"),
    ("gs_goto_x", "dest_x_m"),
    ("gs_goto_y", "dest_y_m"),
)

_KEYS: tuple[str, ...] = (
    "mission_type",
    "mission_label",
    "vmax",
    "altitude_m",
    "delta_m",
    "radius_m",
    "heading_deg",
    "dest_x_m",
    "dest_y_m",
)


def _blank() -> dict[str, int | float | str | None]:
    return {key: None for key in _KEYS}


def _is_missing(value: object) -> bool:
    if value is None:
        return True
    try:
        missing = pd.isna(value)
    except (TypeError, ValueError):
        return False
    if isinstance(missing, (bool, np.bool_)):
        return bool(missing)
    return False


def _as_float(value: object) -> float | None:
    if _is_missing(value):
        return None
    return float(value)  # type: ignore[arg-type]


def _as_int(value: object) -> int | None:
    if _is_missing(value):
        return None
    return int(value)  # type: ignore[arg-type]


def _label(mission_type: int | None) -> str | None:
    if mission_type is None:
        return None
    if 0 <= mission_type < len(MISSION_LABELS):
        return MISSION_LABELS[mission_type]
    return str(mission_type)


def _arm_recv_s(experiment_dir: Path) -> float | None:
    path = experiment_dir / "derived" / "observation" / "anchor.json"
    if not path.is_file():
        return None
    data = json.loads(path.read_text())
    if not isinstance(data, dict):
        return None
    arm = data.get("arm_recv_s")
    if isinstance(arm, bool) or not isinstance(arm, (int, float)):
        return None
    if isinstance(arm, float) and math.isnan(arm):
        return None
    return float(arm)


def mission_at(experiment_dir: Path, t: float) -> dict | None:
    """Last forward-filled command whose experiment time is <= t.

    Returns None when derived/observation/command.parquet is missing.
    A query before every row returns the same keys, each None.
    """
    experiment_dir = Path(experiment_dir)
    parquet = experiment_dir / "derived" / "observation" / "command.parquet"
    if not parquet.is_file():
        return None

    df = pd.read_parquet(parquet)
    if df.empty:
        return _blank()

    t_recv = df["t_recv_s"].to_numpy(dtype=float)
    arm = _arm_recv_s(experiment_dir)
    origin = float(t_recv[0]) if arm is None else arm
    t_exp = t_recv - origin
    idx = int(np.searchsorted(t_exp, float(t), side="right")) - 1
    if idx < 0:
        return _blank()

    row = df.iloc[idx]
    mission_type = (
        _as_int(row["mission_type"]) if "mission_type" in df.columns else None
    )
    snap: dict[str, int | float | str | None] = _blank()
    snap["mission_type"] = mission_type
    snap["mission_label"] = _label(mission_type)
    for source, key in _FLOAT_COLUMNS:
        snap[key] = _as_float(row[source]) if source in df.columns else None
    return snap
