"""Time-series extraction from derived parquet channels."""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from ea.manifest import load_manifest
from ea.sync import t_sm, t_ulog, time_mapping

_POSE_TOPICS = frozenset(
    {
        "vehicle_local_position",
        "vehicle_attitude",
        "vehicle_gps_position",
        "vehicle_global_position",
    }
)

_MAX_POSE_HZ = 20.0
_MIN_POSE_INTERVAL_S = 1.0 / _MAX_POSE_HZ

_SOURCE_PARQUET_DIRS = {
    "ulog": lambda exp_dir, drone_id: exp_dir / "derived" / f"drone_{drone_id}",
    "sm": lambda exp_dir, drone_id: exp_dir / "derived" / f"drone_{drone_id}",
    "ha": lambda exp_dir, drone_id: exp_dir / "derived" / "ha" / f"drone_{drone_id}",
    "ob": lambda exp_dir, drone_id: exp_dir / "derived" / "observation",
}


def _read_sync(experiment_dir: Path) -> dict:
    sync_path = experiment_dir / "derived" / "sync.json"
    if not sync_path.is_file():
        return {}
    with open(sync_path) as f:
        data = json.load(f)
    return data.get("drones", {})


def _parse_channel(channel: str) -> tuple[str, str, str, str] | None:
    parts = channel.split(".", maxsplit=2)
    if len(parts) < 3:
        return None
    drone_id, source, rest = parts
    if not drone_id or source not in _SOURCE_PARQUET_DIRS:
        return None
    topic, sep, field = rest.rpartition(".")
    if not sep or not topic or not field:
        return None
    return drone_id, source, topic, field


def _downsample_max_hz(t: list[float], y: list[float], max_hz: float) -> tuple[list[float], list[float]]:
    if len(t) <= 1:
        return t, y

    min_interval = 1.0 / max_hz
    duration = t[-1] - t[0]
    native_hz = (len(t) - 1) / duration if duration > 0 else float("inf")
    if native_hz <= max_hz:
        return t, y

    out_t: list[float] = [t[0]]
    out_y: list[float] = [y[0]]
    last_kept = t[0]
    for i in range(1, len(t)):
        if t[i] - last_kept >= min_interval:
            out_t.append(t[i])
            out_y.append(y[i])
            last_kept = t[i]

    if out_t[-1] != t[-1]:
        out_t.append(t[-1])
        out_y.append(y[-1])

    return out_t, out_y


def _ha_experiment_times(df: pd.DataFrame, offset_s: float = 0.0) -> list[float]:
    first = float(df["timestamp"].iloc[0])
    return [float(ts) - first + offset_s for ts in df["timestamp"]]


def _finite_number(value: object) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value)


def _sync_t_max_s(experiment_dir: Path) -> float | None:
    sync_path = experiment_dir / "derived" / "sync.json"
    if not sync_path.is_file():
        return None
    with open(sync_path) as f:
        data = json.load(f)
    if not isinstance(data, dict):
        return None
    return _finite_number(data.get("t_max_s"))


def _arm_recv_s(experiment_dir: Path) -> float | None:
    anchor_path = experiment_dir / "derived" / "observation" / "anchor.json"
    if not anchor_path.is_file():
        return None
    with open(anchor_path) as f:
        data = json.load(f)
    if not isinstance(data, dict):
        return None
    return _finite_number(data.get("arm_recv_s"))


def _observation_experiment_times(df: pd.DataFrame, experiment_dir: Path) -> list[float]:
    recv = [float(v) for v in df["t_recv_s"]]
    if not recv:
        return []
    arm = _arm_recv_s(experiment_dir)
    origin = recv[0] if arm is None else arm
    return [t - origin for t in recv]


def _step_series(
    times: list[float],
    values: list[float | None],
    t_max_s: float | None,
) -> tuple[list[float], list[float]]:
    """Flat segments between command changes, then hold through t_max_s."""
    points = [(t, y) for t, y in zip(times, values) if y is not None]
    if not points:
        return [], []

    out_t = [points[0][0]]
    out_y = [points[0][1]]
    for t, y in points[1:]:
        out_t.append(t)
        out_y.append(out_y[-1])
        out_t.append(t)
        out_y.append(y)

    t_last, y_last = points[-1]
    t_end = t_last if t_max_s is None else max(t_max_s, t_last)
    if t_end > t_last:
        out_t.append(t_end)
        out_y.append(y_last)
    return out_t, out_y


def _held_at(t: float, t_vals: list[float], y_vals: list[float]) -> float | None:
    held: float | None = None
    for ti, yi in zip(t_vals, y_vals):
        if ti <= t:
            held = yi
        else:
            break
    return held


def _load_channel_series(
    experiment_dir: Path,
    drone_id: str,
    source: str,
    topic: str,
    field: str,
    sync_info: dict,
    offset_s: float = 0.0,
) -> tuple[list[float], list[float]]:
    base = _SOURCE_PARQUET_DIRS[source](experiment_dir, drone_id)
    parquet_path = base / f"{topic}.parquet"
    if not parquet_path.is_file():
        return [], []

    df = pd.read_parquet(parquet_path)
    if df.empty or field not in df.columns:
        return [], []

    if source == "sm":
        if "local_ts" not in df.columns:
            return [], []
        sm_arm = sync_info.get("sm_arm_local_ts")
        first_local = float(df["local_ts"].iloc[0])
        t_vals = [
            t_sm(float(ts), sm_arm, first_local, offset_s) for ts in df["local_ts"]
        ]
    elif source == "ha":
        if "timestamp" not in df.columns:
            return [], []
        t_vals = _ha_experiment_times(df, offset_s)
    elif source == "ob":
        if "t_recv_s" not in df.columns:
            return [], []
        values: list[float | None] = []
        for raw in df[field]:
            values.append(None if pd.isna(raw) else float(raw))
        return _step_series(
            _observation_experiment_times(df, experiment_dir),
            values,
            _sync_t_max_s(experiment_dir),
        )
    else:
        if "timestamp" not in df.columns:
            return [], []
        arm_us = sync_info.get("ulog_arm_us")
        first_us = int(df["timestamp"].iloc[0])
        t_vals = [t_ulog(float(ts), arm_us, first_us, offset_s) for ts in df["timestamp"]]

    y_vals = [float(v) for v in df[field]]

    if source == "ulog" and topic in _POSE_TOPICS:
        t_vals, y_vals = _downsample_max_hz(t_vals, y_vals, _MAX_POSE_HZ)

    return t_vals, y_vals


def channel_value_at_t(
    experiment_dir: Path,
    channel: str,
    t: float,
) -> float | None:
    """Channel value at experiment time t.

    Observation commands hold the last sample. Other sources interpolate.
    """
    from ea.interp import interp_scalar

    parsed = _parse_channel(channel)
    if parsed is None:
        return None

    drone_id, source, topic, field = parsed
    manifest = load_manifest(experiment_dir / "manifest.json")
    sync_drones = _read_sync(experiment_dir)
    sync_info = dict(sync_drones.get(drone_id, {}))
    arm_us, sm_arm, offset_s = time_mapping(manifest, sync_info, drone_id)
    sync_info["ulog_arm_us"] = arm_us
    sync_info["sm_arm_local_ts"] = sm_arm

    t_vals, y_vals = _load_channel_series(
        experiment_dir, drone_id, source, topic, field, sync_info, offset_s
    )
    if not t_vals:
        return None
    if source == "ob":
        return _held_at(t, t_vals, y_vals)
    return interp_scalar(t, t_vals, y_vals)


def _apply_window(
    t: list[float], y: list[float], t0: float | None, t1: float | None
) -> tuple[list[float], list[float]]:
    if t0 is None and t1 is None:
        return t, y

    out_t: list[float] = []
    out_y: list[float] = []
    for ti, yi in zip(t, y):
        if t0 is not None and ti < t0:
            continue
        if t1 is not None and ti > t1:
            continue
        out_t.append(ti)
        out_y.append(yi)
    return out_t, out_y


def series(
    experiment_dir: Path,
    channels: list[str],
    t0: float | None = None,
    t1: float | None = None,
) -> dict:
    sync_drones = _read_sync(experiment_dir)
    manifest = load_manifest(experiment_dir / "manifest.json")
    result: dict[str, dict[str, list[float]]] = {}

    for channel in channels:
        parsed = _parse_channel(channel)
        if parsed is None:
            result[channel] = {"t": [], "y": []}
            continue

        drone_id, source, topic, field = parsed
        sync_info = dict(sync_drones.get(drone_id, {}))
        arm_us, sm_arm, offset_s = time_mapping(manifest, sync_info, drone_id)
        sync_info["ulog_arm_us"] = arm_us
        sync_info["sm_arm_local_ts"] = sm_arm

        t_vals, y_vals = _load_channel_series(
            experiment_dir, drone_id, source, topic, field, sync_info, offset_s
        )
        t_vals, y_vals = _apply_window(t_vals, y_vals, t0, t1)
        result[channel] = {"t": t_vals, "y": y_vals}

    return result
