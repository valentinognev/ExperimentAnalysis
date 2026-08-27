"""System Manager sm_ned and sm_lla avatars in pose_at."""

from math import pi
from pathlib import Path

import pandas as pd
import pytest

from ea.arm import ulog_arm_us
from ea.extract_ulog import extract_ulog
from ea.geo import METERS_PER_DEG_LAT
from ea.manifest import empty_manifest, save_manifest
from ea.pose import pose_at
from ea.sync import write_sync
from ea.ulog_min import write_min_ulog

_S4_LOCAL = 11412.04
_BASE_LAT = 32.08
_BASE_LON = 34.78
_BASE_ALT = 50.0


def _write_ulog(path: Path, messages: dict) -> None:
    write_min_ulog(path, messages)


def _extract_drone(exp_dir: Path, drone_id: int, ulg: Path) -> Path:
    dest = exp_dir / "derived" / f"drone_{drone_id}"
    extract_ulog(ulg, dest)
    return dest


def _save_manifest_drones(exp_dir: Path, drone_ids: list[int]) -> None:
    manifest = empty_manifest("test")
    manifest["drones"] = [
        {
            "id": did,
            "label": f"D{did}",
            "sources": {"ulg": [], "system_manager": [], "hardware_adapter": []},
        }
        for did in drone_ids
    ]
    save_manifest(exp_dir / "manifest.json", manifest)


def _one_meter_north_lat_deg(base_lat: float) -> float:
    return base_lat + 1.0 / METERS_PER_DEG_LAT


def _write_sm_parquet(derived: Path, rows: list[dict]) -> None:
    pd.DataFrame(rows).to_parquet(derived / "sm_system_manager.parquet", index=False)


def _write_sync(
    exp_dir: Path,
    drone_id: int,
    derived: Path,
    sm_arm_local_ts: float | None = _S4_LOCAL,
) -> None:
    arm_us = None
    status = derived / "vehicle_status.parquet"
    if status.is_file():
        armed = derived / "actuator_armed.parquet"
        arm_us = ulog_arm_us(
            status,
            armed if armed.is_file() else None,
        )
    write_sync(
        exp_dir,
        {
            str(drone_id): {
                "ulog_arm_us": arm_us,
                "sm_arm_local_ts": sm_arm_local_ts,
            },
        },
    )


def _sm_only_fixture(tmp_path) -> Path:
    exp_dir = tmp_path / "exp"
    exp_dir.mkdir()
    derived = exp_dir / "derived" / "drone_2"
    derived.mkdir(parents=True)
    north_lat = _one_meter_north_lat_deg(_BASE_LAT)
    _write_sm_parquet(
        derived,
        [
            {
                "local_ts": 11400.0,
                "timestamp": 999,
                "state_machine_state": "S3",
                "pos_ned/x": 0.0,
                "pos_ned/y": 0.0,
                "pos_ned/z": 0.0,
                "lla/lat_deg": _BASE_LAT,
                "lla/lon_deg": _BASE_LON,
                "lla/alt": _BASE_ALT,
            },
            {
                "local_ts": _S4_LOCAL,
                "timestamp": 1000,
                "state_machine_state": "S4_TAKEOFF",
                "pos_ned/x": 0.0,
                "pos_ned/y": 0.0,
                "pos_ned/z": 0.0,
                "lla/lat_deg": _BASE_LAT,
                "lla/lon_deg": _BASE_LON,
                "lla/alt": _BASE_ALT,
            },
            {
                "local_ts": _S4_LOCAL + 0.010,
                "timestamp": 1100,
                "state_machine_state": "S4_TAKEOFF",
                "pos_ned/x": 1.0,
                "pos_ned/y": 0.0,
                "pos_ned/z": 0.0,
                "lla/lat_deg": north_lat,
                "lla/lon_deg": _BASE_LON,
                "lla/alt": _BASE_ALT,
            },
        ],
    )
    _write_sync(exp_dir, 2, derived)
    _save_manifest_drones(exp_dir, [2])
    return exp_dir


def _sm_with_ulog_fixture(tmp_path) -> Path:
    exp_dir = tmp_path / "exp"
    exp_dir.mkdir()
    ulg = tmp_path / "drone2.ulg"
    base_lat_int = int(round(_BASE_LAT * 1e7))
    base_lon_int = int(round(_BASE_LON * 1e7))
    base_alt_int = int(round(_BASE_ALT * 1000))
    north_lat_int = base_lat_int + int(round(1.0 / METERS_PER_DEG_LAT * 1e7))
    messages = {
        "vehicle_status": [
            {"timestamp": 1000, "arming_state": 1},
            {"timestamp": 5000, "arming_state": 2},
        ],
        "vehicle_local_position": [
            {"timestamp": 5000, "x": 0.0, "y": 0.0, "z": 0.0},
            {"timestamp": 15000, "x": 1.0, "y": 0.0, "z": 0.0},
        ],
        "vehicle_attitude": [
            {"timestamp": 5000, "q[0]": 1.0, "q[1]": 0.0, "q[2]": 0.0, "q[3]": 0.0},
            {"timestamp": 15000, "q[0]": 1.0, "q[1]": 0.0, "q[2]": 0.0, "q[3]": 0.0},
        ],
        "vehicle_gps_position": [
            {"timestamp": 5000, "lat": base_lat_int, "lon": base_lon_int, "alt": base_alt_int},
            {"timestamp": 15000, "lat": north_lat_int, "lon": base_lon_int, "alt": base_alt_int},
        ],
    }
    _write_ulog(ulg, messages)
    derived = _extract_drone(exp_dir, 2, ulg)
    north_lat = _one_meter_north_lat_deg(_BASE_LAT)
    _write_sm_parquet(
        derived,
        [
            {
                "local_ts": 11400.0,
                "timestamp": 999,
                "state_machine_state": "S3",
                "pos_ned/x": 0.0,
                "pos_ned/y": 0.0,
                "pos_ned/z": 0.0,
                "lla/lat_deg": _BASE_LAT,
                "lla/lon_deg": _BASE_LON,
                "lla/alt": _BASE_ALT,
            },
            {
                "local_ts": _S4_LOCAL,
                "timestamp": 1000,
                "state_machine_state": "S4_TAKEOFF",
                "pos_ned/x": 0.0,
                "pos_ned/y": 0.0,
                "pos_ned/z": 0.0,
                "lla/lat_deg": _BASE_LAT,
                "lla/lon_deg": _BASE_LON,
                "lla/alt": _BASE_ALT,
            },
            {
                "local_ts": _S4_LOCAL + 0.010,
                "timestamp": 1100,
                "state_machine_state": "S4_TAKEOFF",
                "pos_ned/x": 1.0,
                "pos_ned/y": 0.0,
                "pos_ned/z": 0.0,
                "lla/lat_deg": north_lat,
                "lla/lon_deg": _BASE_LON,
                "lla/alt": _BASE_ALT,
            },
        ],
    )
    _write_sync(exp_dir, 2, derived)
    _save_manifest_drones(exp_dir, [2])
    return exp_dir


def test_pose_at_sm_only_emits_avatars_without_ulog_present(tmp_path):
    exp_dir = _sm_only_fixture(tmp_path)

    result = pose_at(exp_dir, t=0.0)
    d0 = result["drones"]["2"]
    assert d0["present"] is False
    avatars = d0["avatars"]
    assert "sm_ned" in avatars
    assert "sm_lla" in avatars
    assert "ekf_ned" not in avatars


def test_pose_at_sm_beside_ekf_and_gps(tmp_path):
    exp_dir = _sm_with_ulog_fixture(tmp_path)

    result = pose_at(exp_dir, t=0.0)
    avatars = result["drones"]["2"]["avatars"]
    assert "sm_ned" in avatars
    assert "sm_lla" in avatars
    assert "ekf_ned" in avatars
    assert "gps" in avatars


def test_pose_at_sm_lla_near_origin_at_t0(tmp_path):
    exp_dir = _sm_with_ulog_fixture(tmp_path)

    result = pose_at(exp_dir, t=0.0)
    sm_lla = result["drones"]["2"]["avatars"]["sm_lla"]
    assert sm_lla["e"] == pytest.approx(0.0, abs=0.01)
    assert sm_lla["n"] == pytest.approx(0.0, abs=0.01)
    assert sm_lla["u"] == pytest.approx(0.0, abs=0.01)


def test_pose_at_sm_lla_one_meter_north_at_later_t(tmp_path):
    exp_dir = _sm_with_ulog_fixture(tmp_path)

    result = pose_at(exp_dir, t=0.010)
    sm_lla = result["drones"]["2"]["avatars"]["sm_lla"]
    assert sm_lla["n"] == pytest.approx(1.0, abs=0.05)
    assert sm_lla["e"] == pytest.approx(0.0, abs=0.05)
    assert sm_lla["u"] == pytest.approx(0.0, abs=0.05)


def test_pose_at_sm_ned_one_meter_north_at_later_t(tmp_path):
    exp_dir = _sm_with_ulog_fixture(tmp_path)

    result = pose_at(exp_dir, t=0.010)
    sm_ned = result["drones"]["2"]["avatars"]["sm_ned"]
    assert sm_ned["n"] == pytest.approx(1.0, abs=0.05)
    assert sm_ned["e"] == pytest.approx(0.0, abs=0.05)
    assert sm_ned["u"] == pytest.approx(0.0, abs=0.05)


def test_pose_at_sm_lla_uses_filt_lla_fallback(tmp_path):
    exp_dir = _sm_with_ulog_fixture(tmp_path)
    derived = exp_dir / "derived" / "drone_2"
    north_lat = _one_meter_north_lat_deg(_BASE_LAT)
    _write_sm_parquet(
        derived,
        [
            {
                "local_ts": _S4_LOCAL,
                "state_machine_state": "S4_TAKEOFF",
                "filt_lla/lat_deg": _BASE_LAT,
                "filt_lla/lon_deg": _BASE_LON,
                "filt_lla/alt": _BASE_ALT,
            },
            {
                "local_ts": _S4_LOCAL + 0.010,
                "state_machine_state": "S4_TAKEOFF",
                "filt_lla/lat_deg": north_lat,
                "filt_lla/lon_deg": _BASE_LON,
                "filt_lla/alt": _BASE_ALT,
            },
        ],
    )

    result = pose_at(exp_dir, t=0.010)
    sm_lla = result["drones"]["2"]["avatars"]["sm_lla"]
    assert sm_lla["n"] == pytest.approx(1.0, abs=0.05)


def test_pose_at_sm_omits_ned_without_pos_columns(tmp_path):
    exp_dir = tmp_path / "exp"
    exp_dir.mkdir()
    derived = exp_dir / "derived" / "drone_2"
    derived.mkdir(parents=True)
    _write_sm_parquet(
        derived,
        [
            {
                "local_ts": _S4_LOCAL,
                "state_machine_state": "S4_TAKEOFF",
                "lla/lat_deg": _BASE_LAT,
                "lla/lon_deg": _BASE_LON,
                "lla/alt": _BASE_ALT,
            },
        ],
    )
    _write_sync(exp_dir, 2, derived)
    _save_manifest_drones(exp_dir, [2])

    result = pose_at(exp_dir, t=0.0)
    avatars = result["drones"]["2"]["avatars"]
    assert "sm_lla" in avatars
    assert "sm_ned" not in avatars


def test_pose_at_sm_omits_lla_without_lla_columns(tmp_path):
    exp_dir = tmp_path / "exp"
    exp_dir.mkdir()
    derived = exp_dir / "derived" / "drone_2"
    derived.mkdir(parents=True)
    _write_sm_parquet(
        derived,
        [
            {
                "local_ts": _S4_LOCAL,
                "state_machine_state": "S4_TAKEOFF",
                "pos_ned/x": 0.0,
                "pos_ned/y": 0.0,
                "pos_ned/z": 0.0,
            },
        ],
    )
    _write_sync(exp_dir, 2, derived)
    _save_manifest_drones(exp_dir, [2])

    result = pose_at(exp_dir, t=0.0)
    avatars = result["drones"]["2"]["avatars"]
    assert "sm_ned" in avatars
    assert "sm_lla" not in avatars


def test_pose_at_sm_ned_local_frame_without_reference(tmp_path):
    exp_dir = tmp_path / "exp"
    exp_dir.mkdir()
    derived = exp_dir / "derived" / "drone_2"
    derived.mkdir(parents=True)
    _write_sm_parquet(
        derived,
        [
            {
                "local_ts": _S4_LOCAL,
                "state_machine_state": "S4_TAKEOFF",
                "pos_ned/x": 0.0,
                "pos_ned/y": 2.0,
                "pos_ned/z": 3.0,
            },
            {
                "local_ts": _S4_LOCAL + 0.010,
                "state_machine_state": "S4_TAKEOFF",
                "pos_ned/x": 0.0,
                "pos_ned/y": 2.0,
                "pos_ned/z": 3.0,
            },
        ],
    )
    _write_sync(exp_dir, 2, derived)
    _save_manifest_drones(exp_dir, [2])

    result = pose_at(exp_dir, t=0.010)
    d0 = result["drones"]["2"]
    sm_ned = d0["avatars"]["sm_ned"]
    assert d0["local_frame"] is True
    assert sm_ned["e"] == pytest.approx(2.0, abs=1e-6)
    assert sm_ned["n"] == pytest.approx(0.0, abs=1e-6)
    assert sm_ned["u"] == pytest.approx(-3.0, abs=1e-6)


def test_pose_at_sm_uses_local_ts_not_timestamp(tmp_path):
    exp_dir = _sm_with_ulog_fixture(tmp_path)
    derived = exp_dir / "derived" / "drone_2"
    north_lat = _one_meter_north_lat_deg(_BASE_LAT)
    _write_sm_parquet(
        derived,
        [
            {
                "local_ts": _S4_LOCAL,
                "timestamp": 5000,
                "state_machine_state": "S4_TAKEOFF",
                "lla/lat_deg": _BASE_LAT,
                "lla/lon_deg": _BASE_LON,
                "lla/alt": _BASE_ALT,
            },
            {
                "local_ts": _S4_LOCAL + 0.010,
                "timestamp": 999999,
                "state_machine_state": "S4_TAKEOFF",
                "lla/lat_deg": north_lat,
                "lla/lon_deg": _BASE_LON,
                "lla/alt": _BASE_ALT,
            },
        ],
    )

    result = pose_at(exp_dir, t=0.010)
    sm_lla = result["drones"]["2"]["avatars"]["sm_lla"]
    assert sm_lla["n"] == pytest.approx(1.0, abs=0.05)
