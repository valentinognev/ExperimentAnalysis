"""Interpolated pose-at-t from derived parquet."""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from ea.geo import lla_to_enu, mean_origin, ned_to_enu
from ea.interp import interp_scalar, slerp_xyzw
from ea.manifest import load_manifest
from ea.sync import t_ulog

_GPS_TOPICS = ("vehicle_gps_position", "vehicle_global_position")


def _scale_gps(lat: float, lon: float, alt: float) -> tuple[float, float, float]:
    if abs(lat) > 1000:
        lat /= 1e7
        lon /= 1e7
        alt /= 1000
    return lat, lon, alt


def _read_sync(experiment_dir: Path) -> dict:
    sync_path = experiment_dir / "derived" / "sync.json"
    if not sync_path.is_file():
        return {}
    with open(sync_path) as f:
        data = json.load(f)
    return data.get("drones", {})


def _drone_derived(experiment_dir: Path, drone_id: str) -> Path:
    return experiment_dir / "derived" / f"drone_{drone_id}"


def _parquet_path(derived: Path, topic: str) -> Path | None:
    path = derived / f"{topic}.parquet"
    return path if path.is_file() else None


def _gps_parquet(derived: Path) -> Path | None:
    for topic in _GPS_TOPICS:
        path = _parquet_path(derived, topic)
        if path is not None:
            return path
    return None


def _experiment_times(df: pd.DataFrame, arm_us: int | None) -> list[float]:
    first_us = int(df["timestamp"].iloc[0])
    return [t_ulog(float(ts), arm_us, first_us) for ts in df["timestamp"]]


def _attitude_wxyz_columns(df: pd.DataFrame) -> tuple[str, str, str, str] | None:
    if "q[0]" in df.columns:
        return "q[0]", "q[1]", "q[2]", "q[3]"
    if "q0" in df.columns:
        return "q0", "q1", "q2", "q3"
    return None


def _wxyz_to_xyzw(qw: float, qx: float, qy: float, qz: float) -> tuple[float, float, float, float]:
    return (qx, qy, qz, qw)


def _lla_at_timestamp(df: pd.DataFrame, t_us: int) -> tuple[float, float, float] | None:
    if df.empty:
        return None
    idx = (df["timestamp"] - t_us).abs().idxmin()
    row = df.loc[idx]
    lat = float(row["lat"])
    lon = float(row["lon"])
    alt = float(row["alt"])
    return _scale_gps(lat, lon, alt)


def _home_lla(derived: Path) -> tuple[float, float, float] | None:
    path = _parquet_path(derived, "home_position")
    if path is None:
        return None
    df = pd.read_parquet(path)
    if df.empty:
        return None
    row = df.iloc[0]
    lat = float(row.get("lat", row.get("latitude", 0)))
    lon = float(row.get("lon", row.get("longitude", 0)))
    alt = float(row.get("alt", row.get("altitude", 0)))
    return _scale_gps(lat, lon, alt)


def _reference_lla(derived: Path, arm_us: int | None) -> tuple[float, float, float] | None:
    home = _home_lla(derived)
    if home is not None:
        return home
    gps_path = _gps_parquet(derived)
    if gps_path is None or arm_us is None:
        return None
    df = pd.read_parquet(gps_path)
    return _lla_at_timestamp(df, arm_us)


def _gps_lla_at_arm(derived: Path, arm_us: int | None) -> tuple[float, float, float] | None:
    gps_path = _gps_parquet(derived)
    if gps_path is None or arm_us is None:
        return None
    df = pd.read_parquet(gps_path)
    return _lla_at_timestamp(df, arm_us)


def _interpolate_ekf_ned(
    derived: Path,
    arm_us: int | None,
    t: float,
) -> tuple[tuple[float, float, float] | None, bool]:
    lp_path = _parquet_path(derived, "vehicle_local_position")
    if lp_path is None:
        return None, False
    df = pd.read_parquet(lp_path)
    if df.empty:
        return None, False

    ts = _experiment_times(df, arm_us)
    if t < ts[0] or t > ts[-1]:
        return None, False

    x = interp_scalar(t, ts, [float(v) for v in df["x"]])
    y = interp_scalar(t, ts, [float(v) for v in df["y"]])
    z = interp_scalar(t, ts, [float(v) for v in df["z"]])
    if x is None or y is None or z is None:
        return None, False
    return (x, y, z), True


def _interpolate_gps_enu(
    derived: Path,
    arm_us: int | None,
    t: float,
    origin_lat: float,
    origin_lon: float,
    origin_alt: float,
) -> tuple[tuple[float, float, float] | None, bool]:
    gps_path = _gps_parquet(derived)
    if gps_path is None:
        return None, False
    df = pd.read_parquet(gps_path)
    if df.empty:
        return None, False

    ts = _experiment_times(df, arm_us)
    if t < ts[0] or t > ts[-1]:
        return None, False

    lats: list[float] = []
    lons: list[float] = []
    alts: list[float] = []
    for _, row in df.iterrows():
        lat, lon, alt = _scale_gps(
            float(row["lat"]),
            float(row["lon"]),
            float(row["alt"]),
        )
        lats.append(lat)
        lons.append(lon)
        alts.append(alt)

    lat = interp_scalar(t, ts, lats)
    lon = interp_scalar(t, ts, lons)
    alt = interp_scalar(t, ts, alts)
    if lat is None or lon is None or alt is None:
        return None, False

    e, n, u = lla_to_enu(lat, lon, alt, origin_lat, origin_lon, origin_alt)
    return (e, n, u), True


def _interpolate_attitude(
    derived: Path,
    arm_us: int | None,
    t: float,
) -> tuple[tuple[float, float, float, float] | None, bool]:
    att_path = _parquet_path(derived, "vehicle_attitude")
    if att_path is None:
        return None, False
    df = pd.read_parquet(att_path)
    if df.empty:
        return None, False

    cols = _attitude_wxyz_columns(df)
    if cols is None:
        return None, False

    ts = _experiment_times(df, arm_us)
    if t < ts[0] or t > ts[-1]:
        return None, False

    qw_col, qx_col, qy_col, qz_col = cols
    quats_xyzw = [
        _wxyz_to_xyzw(
            float(row[qw_col]),
            float(row[qx_col]),
            float(row[qy_col]),
            float(row[qz_col]),
        )
        for _, row in df.iterrows()
    ]
    q = slerp_xyzw(t, ts, quats_xyzw)
    if q is None:
        return None, False
    return q, True


def _compute_origin(
    experiment_dir: Path,
    drone_ids: list[str],
    sync_drones: dict,
) -> dict:
    llas: list[tuple[float, float, float]] = []
    for drone_id in drone_ids:
        derived = _drone_derived(experiment_dir, drone_id)
        sync_info = sync_drones.get(drone_id, {})
        arm_us = sync_info.get("ulog_arm_us")
        lla = _gps_lla_at_arm(derived, arm_us)
        if lla is not None:
            llas.append(lla)

    if not llas:
        return {"lat": 0.0, "lon": 0.0, "alt_m": 0.0}

    lat, lon, alt = mean_origin(llas)
    return {"lat": lat, "lon": lon, "alt_m": alt}


def pose_at(experiment_dir: Path, t: float) -> dict:
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
        synced = sync_info.get("synced", arm_us is not None)

        ekf_ned, pos_ok = _interpolate_ekf_ned(derived, arm_us, t)
        attitude, att_ok = _interpolate_attitude(derived, arm_us, t)
        present = pos_ok and att_ok

        drone_dict: dict = {
            "present": present,
            "synced": synced,
        }

        if present and ekf_ned is not None and attitude is not None:
            x, y, z = ekf_ned
            avatars: dict = {}
            ref_lla = _reference_lla(derived, arm_us)
            if ref_lla is not None:
                ref_lat, ref_lon, ref_alt = ref_lla
                ref_e, ref_n, ref_u = lla_to_enu(
                    ref_lat, ref_lon, ref_alt, origin_lat, origin_lon, origin_alt
                )
                e_off, n_off, u_off = ned_to_enu(x, y, z)
                avatars["ekf_ned"] = {
                    "e": ref_e + e_off,
                    "n": ref_n + n_off,
                    "u": ref_u + u_off,
                }
            else:
                e, n, u = ned_to_enu(x, y, z)
                drone_dict["local_frame"] = True
                avatars["ekf_ned"] = {"e": e, "n": n, "u": u}

            gps_enu, gps_ok = _interpolate_gps_enu(
                derived, arm_us, t, origin_lat, origin_lon, origin_alt
            )
            if gps_ok and gps_enu is not None:
                e_g, n_g, u_g = gps_enu
                avatars["gps"] = {"e": e_g, "n": n_g, "u": u_g}

            drone_dict["avatars"] = avatars
            drone_dict["attitude_q_xyzw"] = list(attitude)

        drones_out[drone_id] = drone_dict

    return {
        "t": t,
        "origin": origin,
        "drones": drones_out,
    }
