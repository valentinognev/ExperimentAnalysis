"""Interpolated pose-at-t from derived parquet."""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import pandas as pd

from ea.geo import lla_to_enu, mean_origin, ned_to_enu
from ea.interp import interp_scalar, slerp_xyzw
from ea.manifest import load_manifest
from ea.replay_id import is_replay_id
from ea.series import channel_value_at_t
from ea.sync import manual_offset_s as _manual_offset_s, t_sm

_GPS_TOPICS = ("vehicle_gps_position", "vehicle_global_position")
_ARM_T0_SLACK_S = 0.5


def _in_experiment_time_range(t: float, ts: list[float]) -> bool:
    if not ts:
        return False
    if t > ts[-1]:
        return False
    if t >= ts[0]:
        return True
    return t == 0.0 and ts[0] <= _ARM_T0_SLACK_S


def _effective_experiment_t(t: float, ts: list[float]) -> float:
    if t < ts[0] and t == 0.0 and ts[0] <= _ARM_T0_SLACK_S:
        return ts[0]
    return t


def _scale_gps(lat: float, lon: float, alt: float) -> tuple[float, float, float]:
    if abs(lat) > 1000:
        lat /= 1e7
        lon /= 1e7
        alt /= 1000
    return lat, lon, alt


def _lla_from_row(row: pd.Series) -> tuple[float, float, float]:
    if "latitude_deg" in row.index:
        lat = float(row["latitude_deg"])
        lon = float(row["longitude_deg"])
        alt = float(row.get("altitude_msl_m", row.get("altitude_ellipsoid_m", 0)))
        return lat, lon, alt
    lat = float(row.get("lat", row.get("latitude", 0)))
    lon = float(row.get("lon", row.get("longitude", 0)))
    alt = float(row.get("alt", row.get("altitude", 0)))
    return _scale_gps(lat, lon, alt)


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


def _experiment_times(
    df: pd.DataFrame, arm_us: int | None, offset_s: float = 0.0
) -> list[float]:
    ts_us = df["timestamp"].to_numpy(dtype=np.float64, copy=False)
    first_us = float(ts_us[0])
    origin = float(arm_us) if arm_us is not None else first_us
    return ((ts_us - origin) / 1e6 + offset_s).tolist()


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
    return _lla_from_row(row)


def _home_lla(derived: Path) -> tuple[float, float, float] | None:
    path = _parquet_path(derived, "home_position")
    if path is None:
        return None
    df = pd.read_parquet(path)
    if df.empty:
        return None
    return _lla_from_row(df.iloc[0])


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
    offset_s: float = 0.0,
) -> tuple[tuple[float, float, float] | None, bool]:
    lp_path = _parquet_path(derived, "vehicle_local_position")
    if lp_path is None:
        return None, False
    df = pd.read_parquet(lp_path)
    if df.empty:
        return None, False

    ts = _experiment_times(df, arm_us, offset_s)
    if not _in_experiment_time_range(t, ts):
        return None, False
    t = _effective_experiment_t(t, ts)

    x = interp_scalar(t, ts, [float(v) for v in df["x"]])
    y = interp_scalar(t, ts, [float(v) for v in df["y"]])
    z = interp_scalar(t, ts, [float(v) for v in df["z"]])
    if x is None or y is None or z is None:
        return None, False
    return (x, y, z), True


def _lla_arrays(
    df: pd.DataFrame,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    if "latitude_deg" in df.columns:
        lat = df["latitude_deg"].to_numpy(dtype=float, copy=False)
        lon = df["longitude_deg"].to_numpy(dtype=float, copy=False)
        if "altitude_msl_m" in df.columns:
            alt = df["altitude_msl_m"].to_numpy(dtype=float, copy=False)
        elif "altitude_ellipsoid_m" in df.columns:
            alt = df["altitude_ellipsoid_m"].to_numpy(dtype=float, copy=False)
        else:
            alt = np.zeros(len(df), dtype=float)
        return lat, lon, alt

    lat_col = "lat" if "lat" in df.columns else "latitude"
    lon_col = "lon" if "lon" in df.columns else "longitude"
    alt_col = "alt" if "alt" in df.columns else "altitude"
    lat = (
        df[lat_col].to_numpy(dtype=float, copy=False)
        if lat_col in df.columns
        else np.zeros(len(df), dtype=float)
    )
    lon = (
        df[lon_col].to_numpy(dtype=float, copy=False)
        if lon_col in df.columns
        else np.zeros(len(df), dtype=float)
    )
    alt = (
        df[alt_col].to_numpy(dtype=float, copy=False)
        if alt_col in df.columns
        else np.zeros(len(df), dtype=float)
    )
    scale = np.abs(lat) > 1000
    if np.any(scale):
        lat = np.where(scale, lat / 1e7, lat)
        lon = np.where(scale, lon / 1e7, lon)
        alt = np.where(scale, alt / 1000.0, alt)
    return lat, lon, alt


def _interpolate_gps_enu(
    derived: Path,
    arm_us: int | None,
    t: float,
    origin_lat: float,
    origin_lon: float,
    origin_alt: float,
    offset_s: float = 0.0,
) -> tuple[tuple[float, float, float] | None, bool]:
    gps_path = _gps_parquet(derived)
    if gps_path is None:
        return None, False
    df = pd.read_parquet(gps_path)
    if df.empty:
        return None, False

    ts = _experiment_times(df, arm_us, offset_s)
    if not _in_experiment_time_range(t, ts):
        return None, False
    t = _effective_experiment_t(t, ts)

    lats, lons, alts = _lla_arrays(df)
    lat = interp_scalar(t, ts, lats.tolist())
    lon = interp_scalar(t, ts, lons.tolist())
    alt = interp_scalar(t, ts, alts.tolist())
    if lat is None or lon is None or alt is None:
        return None, False

    e, n, u = lla_to_enu(lat, lon, alt, origin_lat, origin_lon, origin_alt)
    return (e, n, u), True


def _interpolate_attitude(
    derived: Path,
    arm_us: int | None,
    t: float,
    offset_s: float = 0.0,
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

    ts = _experiment_times(df, arm_us, offset_s)
    if not _in_experiment_time_range(t, ts):
        return None, False
    t = _effective_experiment_t(t, ts)

    qw_col, qx_col, qy_col, qz_col = cols
    qx = df[qx_col].to_numpy(dtype=float, copy=False)
    qy = df[qy_col].to_numpy(dtype=float, copy=False)
    qz = df[qz_col].to_numpy(dtype=float, copy=False)
    qw = df[qw_col].to_numpy(dtype=float, copy=False)
    ts_arr = np.asarray(ts, dtype=float)
    i = int(np.searchsorted(ts_arr, t, side="right") - 1)
    i = min(max(i, 0), len(ts_arr) - 1)
    j = min(i + 1, len(ts_arr) - 1)
    q0 = _wxyz_to_xyzw(float(qw[i]), float(qx[i]), float(qy[i]), float(qz[i]))
    q1 = _wxyz_to_xyzw(float(qw[j]), float(qx[j]), float(qy[j]), float(qz[j]))
    q = slerp_xyzw(t, [float(ts_arr[i]), float(ts_arr[j])], [q0, q1])
    if q is None:
        return None, False
    return q, True


def _interpolate_vector_enu(
    experiment_dir: Path,
    channels: list[str],
    t: float,
) -> dict[str, float] | None:
    if len(channels) != 3:
        return None
    vx = channel_value_at_t(experiment_dir, channels[0], t)
    vy = channel_value_at_t(experiment_dir, channels[1], t)
    vz = channel_value_at_t(experiment_dir, channels[2], t)
    if vx is None or vy is None or vz is None:
        return None
    e, n, u = ned_to_enu(vx, vy, vz)
    return {"e": e, "n": n, "u": u}


def _sm_parquet_path(derived: Path) -> Path | None:
    path = derived / "sm_system_manager.parquet"
    return path if path.is_file() else None


def _sm_experiment_times(
    df: pd.DataFrame, sm_arm_local: float | None, offset_s: float = 0.0
) -> list[float]:
    first_local = float(df["local_ts"].iloc[0])
    return [
        t_sm(float(ts), sm_arm_local, first_local, offset_s) for ts in df["local_ts"]
    ]


def _sm_pos_ned_columns(df: pd.DataFrame) -> tuple[str, str, str] | None:
    cols = ("pos_ned/x", "pos_ned/y", "pos_ned/z")
    if all(c in df.columns for c in cols):
        return cols
    return None


def _sm_lla_columns(df: pd.DataFrame) -> tuple[str, str, str] | None:
    lla = ("lla/lat_deg", "lla/lon_deg", "lla/alt")
    if all(c in df.columns for c in lla):
        return lla
    filt = ("filt_lla/lat_deg", "filt_lla/lon_deg", "filt_lla/alt")
    if all(c in df.columns for c in filt):
        return filt
    return None


def _initial_pos_lla_from_sm(df: pd.DataFrame) -> tuple[float, float, float] | None:
    deg_cols = ("initialPos_lla/lat_deg", "initialPos_lla/lon_deg", "initialPos_lla/alt")
    if not all(c in df.columns for c in deg_cols):
        return None
    row = df.iloc[0]
    lat = float(row[deg_cols[0]])
    lon = float(row[deg_cols[1]])
    alt = float(row[deg_cols[2]])
    if all(math.isfinite(v) for v in (lat, lon, alt)):
        return lat, lon, alt
    return None


def _sm_lla_at_arm(
    sm_df: pd.DataFrame,
    sm_arm_local: float | None,
) -> tuple[float, float, float] | None:
    lat_col, lon_col, alt_col = "lla/lat_deg", "lla/lon_deg", "lla/alt"
    if not all(c in sm_df.columns for c in (lat_col, lon_col, alt_col)):
        return None
    ts = _sm_experiment_times(sm_df, sm_arm_local)
    for i in sorted(range(len(ts)), key=lambda j: abs(ts[j])):
        row = sm_df.iloc[i]
        try:
            lat = float(row[lat_col])
            lon = float(row[lon_col])
            alt = float(row[alt_col])
        except (TypeError, ValueError):
            continue
        if all(math.isfinite(v) for v in (lat, lon, alt)):
            return lat, lon, alt
    return None


def _sm_ned_reference_lla(
    derived: Path,
    arm_us: int | None,
    sm_arm_local: float | None,
    sm_df: pd.DataFrame,
) -> tuple[float, float, float] | None:
    ref = _initial_pos_lla_from_sm(sm_df)
    if ref is not None:
        return ref
    ref = _sm_lla_at_arm(sm_df, sm_arm_local)
    if ref is not None:
        return ref
    return _reference_lla(derived, arm_us)


def _interpolate_sm_ned(
    derived: Path,
    arm_us: int | None,
    sm_arm_local: float | None,
    t: float,
    origin_lat: float,
    origin_lon: float,
    origin_alt: float,
    sm_df: pd.DataFrame,
    offset_s: float = 0.0,
) -> tuple[dict[str, float] | None, bool, bool]:
    cols = _sm_pos_ned_columns(sm_df)
    if cols is None:
        return None, False, False

    ts = _sm_experiment_times(sm_df, sm_arm_local, offset_s)
    if t < ts[0] or t > ts[-1]:
        return None, False, False

    x_col, y_col, z_col = cols
    x = interp_scalar(t, ts, [float(v) for v in sm_df[x_col]])
    y = interp_scalar(t, ts, [float(v) for v in sm_df[y_col]])
    z = interp_scalar(t, ts, [float(v) for v in sm_df[z_col]])
    if x is None or y is None or z is None:
        return None, False, False

    ref_lla = _sm_ned_reference_lla(derived, arm_us, sm_arm_local, sm_df)
    if ref_lla is not None:
        ref_lat, ref_lon, ref_alt = ref_lla
        ref_e, ref_n, ref_u = lla_to_enu(
            ref_lat, ref_lon, ref_alt, origin_lat, origin_lon, origin_alt
        )
        e_off, n_off, u_off = ned_to_enu(x, y, z)
        return {"e": ref_e + e_off, "n": ref_n + n_off, "u": ref_u + u_off}, True, False

    e, n, u = ned_to_enu(x, y, z)
    return {"e": e, "n": n, "u": u}, True, True


def _interpolate_sm_lla(
    sm_arm_local: float | None,
    t: float,
    origin_lat: float,
    origin_lon: float,
    origin_alt: float,
    sm_df: pd.DataFrame,
    offset_s: float = 0.0,
) -> tuple[dict[str, float] | None, bool]:
    cols = _sm_lla_columns(sm_df)
    if cols is None:
        return None, False

    ts = _sm_experiment_times(sm_df, sm_arm_local, offset_s)
    if t < ts[0] or t > ts[-1]:
        return None, False

    lat_col, lon_col, alt_col = cols
    lat = interp_scalar(t, ts, [float(v) for v in sm_df[lat_col]])
    lon = interp_scalar(t, ts, [float(v) for v in sm_df[lon_col]])
    alt = interp_scalar(t, ts, [float(v) for v in sm_df[alt_col]])
    if lat is None or lon is None or alt is None:
        return None, False

    e, n, u = lla_to_enu(lat, lon, alt, origin_lat, origin_lon, origin_alt)
    return {"e": e, "n": n, "u": u}, True


def _sm_avatars_at(
    derived: Path,
    sync_info: dict,
    arm_us: int | None,
    t: float,
    origin_lat: float,
    origin_lon: float,
    origin_alt: float,
    offset_s: float = 0.0,
) -> tuple[dict[str, dict[str, float]], bool]:
    sm_path = _sm_parquet_path(derived)
    if sm_path is None:
        return {}, False

    sm_df = pd.read_parquet(sm_path)
    if sm_df.empty or "local_ts" not in sm_df.columns:
        return {}, False

    sm_arm_local = sync_info.get("sm_arm_local_ts")
    avatars: dict[str, dict[str, float]] = {}
    local_frame = False

    sm_ned, ned_ok, ned_local = _interpolate_sm_ned(
        derived,
        arm_us,
        sm_arm_local,
        t,
        origin_lat,
        origin_lon,
        origin_alt,
        sm_df,
        offset_s,
    )
    if ned_ok and sm_ned is not None:
        avatars["sm_ned"] = sm_ned
        if ned_local:
            local_frame = True

    sm_lla, lla_ok = _interpolate_sm_lla(
        sm_arm_local,
        t,
        origin_lat,
        origin_lon,
        origin_alt,
        sm_df,
        offset_s,
    )
    if lla_ok and sm_lla is not None:
        avatars["sm_lla"] = sm_lla

    return avatars, local_frame


def _compute_origin(
    experiment_dir: Path,
    drone_ids: list[str],
    sync_drones: dict,
) -> dict:
    llas: list[tuple[float, float, float]] = []
    for drone_id in drone_ids:
        if is_replay_id(drone_id):
            continue
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
    ui_vectors = manifest.get("ui", {}).get("vectors", {})
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
        offset_s = _manual_offset_s(manifest, drone_id)

        ekf_ned, pos_ok = _interpolate_ekf_ned(derived, arm_us, t, offset_s)
        attitude, att_ok = _interpolate_attitude(derived, arm_us, t, offset_s)
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
                derived, arm_us, t, origin_lat, origin_lon, origin_alt, offset_s
            )
            if gps_ok and gps_enu is not None:
                e_g, n_g, u_g = gps_enu
                avatars["gps"] = {"e": e_g, "n": n_g, "u": u_g}

            drone_dict["avatars"] = avatars
            drone_dict["attitude_q_xyzw"] = list(attitude)

        sm_avatars, sm_local_frame = _sm_avatars_at(
            derived,
            sync_info,
            arm_us,
            t,
            origin_lat,
            origin_lon,
            origin_alt,
            offset_s,
        )
        if sm_avatars:
            if "avatars" not in drone_dict:
                drone_dict["avatars"] = {}
            drone_dict["avatars"].update(sm_avatars)
        if sm_local_frame:
            drone_dict["local_frame"] = True

        vec_cfg = ui_vectors.get(drone_id)
        if vec_cfg:
            channels = vec_cfg.get("channels")
            if isinstance(channels, list) and len(channels) == 3:
                velocity = _interpolate_vector_enu(experiment_dir, channels, t)
                if velocity is not None:
                    drone_dict["vectors"] = {"velocity": velocity}

        drones_out[drone_id] = drone_dict

    return {
        "t": t,
        "origin": origin,
        "drones": drones_out,
    }
