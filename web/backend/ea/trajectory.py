"""Logged ENU paths per avatar, downsampled to 20 Hz."""

from __future__ import annotations

from math import cos, pi
from pathlib import Path

import numpy as np
import pandas as pd

from ea.geo import METERS_PER_DEG_LAT, lla_to_enu
from ea.manifest import load_manifest
from ea.pose import (
    _compute_origin,
    _drone_derived,
    _experiment_times,
    _gps_parquet,
    _lla_arrays,
    _manual_offset_s,
    _parquet_path,
    _read_sync,
    _reference_lla,
    _sm_experiment_times,
    _sm_lla_columns,
    _sm_ned_reference_lla,
    _sm_parquet_path,
    _sm_pos_ned_columns,
)

_MAX_HZ = 20.0


def _keep_indices(ts: np.ndarray, max_hz: float = _MAX_HZ) -> np.ndarray:
    n = len(ts)
    if n <= 1:
        return np.arange(n, dtype=int)
    duration = float(ts[-1] - ts[0])
    if duration <= 0:
        return np.array([0], dtype=int)
    native_hz = (n - 1) / duration
    if native_hz <= max_hz:
        return np.arange(n, dtype=int)
    min_interval = 1.0 / max_hz
    keep = [0]
    last = float(ts[0])
    for i in range(1, n):
        if float(ts[i]) - last >= min_interval:
            keep.append(i)
            last = float(ts[i])
    if keep[-1] != n - 1:
        keep.append(n - 1)
    return np.asarray(keep, dtype=int)


def _pack(ts: np.ndarray, e: np.ndarray, n: np.ndarray, u: np.ndarray) -> dict:
    idx = _keep_indices(ts)
    return {
        "t": ts[idx].astype(float).tolist(),
        "e": np.asarray(e, dtype=float)[idx].tolist(),
        "n": np.asarray(n, dtype=float)[idx].tolist(),
        "u": np.asarray(u, dtype=float)[idx].tolist(),
    }


def _ned_to_enu_arr(
    x: np.ndarray, y: np.ndarray, z: np.ndarray
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    return y, x, -z


def _lla_to_enu_arr(
    lat: np.ndarray,
    lon: np.ndarray,
    alt: np.ndarray,
    origin_lat: float,
    origin_lon: float,
    origin_alt: float,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    n = (lat - origin_lat) * METERS_PER_DEG_LAT
    e = (lon - origin_lon) * METERS_PER_DEG_LAT * cos(origin_lat * pi / 180)
    u = alt - origin_alt
    return e, n, u


def _ekf_path(
    derived: Path,
    arm_us: int | None,
    offset_s: float,
    origin_lat: float,
    origin_lon: float,
    origin_alt: float,
) -> dict | None:
    lp_path = _parquet_path(derived, "vehicle_local_position")
    if lp_path is None:
        return None
    df = pd.read_parquet(lp_path)
    if df.empty or not {"x", "y", "z"}.issubset(df.columns):
        return None
    ts = np.asarray(_experiment_times(df, arm_us, offset_s), dtype=float)
    x = df["x"].to_numpy(dtype=float, copy=False)
    y = df["y"].to_numpy(dtype=float, copy=False)
    z = df["z"].to_numpy(dtype=float, copy=False)
    e_off, n_off, u_off = _ned_to_enu_arr(x, y, z)
    ref_lla = _reference_lla(derived, arm_us)
    if ref_lla is not None:
        ref_e, ref_n, ref_u = lla_to_enu(
            ref_lla[0], ref_lla[1], ref_lla[2], origin_lat, origin_lon, origin_alt
        )
        e = e_off + ref_e
        n = n_off + ref_n
        u = u_off + ref_u
    else:
        e, n, u = e_off, n_off, u_off
    return _pack(ts, e, n, u)


def _gps_path(
    derived: Path,
    arm_us: int | None,
    offset_s: float,
    origin_lat: float,
    origin_lon: float,
    origin_alt: float,
) -> dict | None:
    gps_path = _gps_parquet(derived)
    if gps_path is None:
        return None
    df = pd.read_parquet(gps_path)
    if df.empty:
        return None
    ts = np.asarray(_experiment_times(df, arm_us, offset_s), dtype=float)
    lat, lon, alt = _lla_arrays(df)
    e, n, u = _lla_to_enu_arr(lat, lon, alt, origin_lat, origin_lon, origin_alt)
    return _pack(ts, e, n, u)


def _sm_paths(
    derived: Path,
    arm_us: int | None,
    sm_arm_local: float | None,
    offset_s: float,
    origin_lat: float,
    origin_lon: float,
    origin_alt: float,
) -> dict[str, dict]:
    sm_path = _sm_parquet_path(derived)
    if sm_path is None:
        return {}
    sm_df = pd.read_parquet(sm_path)
    if sm_df.empty or "local_ts" not in sm_df.columns:
        return {}
    ts = np.asarray(_sm_experiment_times(sm_df, sm_arm_local, offset_s), dtype=float)
    out: dict[str, dict] = {}

    ned_cols = _sm_pos_ned_columns(sm_df)
    if ned_cols is not None:
        x = sm_df[ned_cols[0]].to_numpy(dtype=float, copy=False)
        y = sm_df[ned_cols[1]].to_numpy(dtype=float, copy=False)
        z = sm_df[ned_cols[2]].to_numpy(dtype=float, copy=False)
        e_off, n_off, u_off = _ned_to_enu_arr(x, y, z)
        ref_lla = _sm_ned_reference_lla(derived, arm_us, sm_arm_local, sm_df)
        if ref_lla is not None:
            ref_e, ref_n, ref_u = lla_to_enu(
                ref_lla[0],
                ref_lla[1],
                ref_lla[2],
                origin_lat,
                origin_lon,
                origin_alt,
            )
            e = e_off + ref_e
            n = n_off + ref_n
            u = u_off + ref_u
        else:
            e, n, u = e_off, n_off, u_off
        out["sm_ned"] = _pack(ts, e, n, u)

    lla_cols = _sm_lla_columns(sm_df)
    if lla_cols is not None:
        lat = sm_df[lla_cols[0]].to_numpy(dtype=float, copy=False)
        lon = sm_df[lla_cols[1]].to_numpy(dtype=float, copy=False)
        alt = sm_df[lla_cols[2]].to_numpy(dtype=float, copy=False)
        e, n, u = _lla_to_enu_arr(lat, lon, alt, origin_lat, origin_lon, origin_alt)
        out["sm_lla"] = _pack(ts, e, n, u)

    return out


def trajectory(experiment_dir: Path) -> dict:
    manifest = load_manifest(experiment_dir / "manifest.json")
    sync_drones = _read_sync(experiment_dir)
    drone_ids = [str(d["id"]) for d in manifest.get("drones", [])]
    origin = _compute_origin(experiment_dir, drone_ids, sync_drones)
    origin_lat = origin["lat"]
    origin_lon = origin["lon"]
    origin_alt = origin["alt_m"]

    drones_out: dict[str, dict] = {}
    for drone_id in drone_ids:
        derived = _drone_derived(experiment_dir, drone_id)
        sync_info = sync_drones.get(drone_id, {})
        arm_us = sync_info.get("ulog_arm_us")
        offset_s = _manual_offset_s(manifest, drone_id)
        sources: dict[str, dict] = {}

        ekf = _ekf_path(
            derived, arm_us, offset_s, origin_lat, origin_lon, origin_alt
        )
        if ekf is not None:
            sources["ekf_ned"] = ekf

        gps = _gps_path(
            derived, arm_us, offset_s, origin_lat, origin_lon, origin_alt
        )
        if gps is not None:
            sources["gps"] = gps

        sources.update(
            _sm_paths(
                derived,
                arm_us,
                sync_info.get("sm_arm_local_ts"),
                offset_s,
                origin_lat,
                origin_lon,
                origin_alt,
            )
        )
        if sources:
            drones_out[drone_id] = sources

    return {"origin": origin, "drones": drones_out}
