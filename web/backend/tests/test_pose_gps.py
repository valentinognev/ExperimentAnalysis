"""GPS avatar alongside EKF in pose_at."""

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


def _write_ulog(path: Path, messages: dict) -> None:
    write_min_ulog(path, messages)


def _extract_drone(exp_dir: Path, drone_id: int, ulg: Path) -> Path:
    dest = exp_dir / "derived" / f"drone_{drone_id}"
    extract_ulog(ulg, dest)
    return dest


def _write_sync_for_drone(exp_dir: Path, drone_id: int, derived: Path) -> None:
    arm_us = ulog_arm_us(
        derived / "vehicle_status.parquet",
        derived / "actuator_armed.parquet" if (derived / "actuator_armed.parquet").is_file() else None,
    )
    write_sync(
        exp_dir,
        {
            str(drone_id): {
                "ulog_arm_us": arm_us,
                "sm_arm_local_ts": None,
            },
        },
    )


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


def _one_meter_north_lat_int(base_lat_int: int) -> int:
    delta_deg = 1.0 / METERS_PER_DEG_LAT
    return base_lat_int + int(round(delta_deg * 1e7))


def _build_two_gps_fixture(tmp_path) -> Path:
    exp_dir = tmp_path / "exp"
    exp_dir.mkdir()
    ulg = tmp_path / "drone2.ulg"
    base_lat = 320800000
    base_lon = 347800000
    base_alt = 50000
    north_lat = _one_meter_north_lat_int(base_lat)
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
            {"timestamp": 5000, "lat": base_lat, "lon": base_lon, "alt": base_alt},
            {"timestamp": 15000, "lat": north_lat, "lon": base_lon, "alt": base_alt},
        ],
    }
    _write_ulog(ulg, messages)
    derived = _extract_drone(exp_dir, 2, ulg)
    _write_sync_for_drone(exp_dir, 2, derived)
    _save_manifest_drones(exp_dir, [2])
    return exp_dir


def _build_no_gps_fixture(tmp_path) -> Path:
    exp_dir = tmp_path / "exp"
    exp_dir.mkdir()
    ulg = tmp_path / "drone2.ulg"
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
    }
    _write_ulog(ulg, messages)
    derived = _extract_drone(exp_dir, 2, ulg)
    _write_sync_for_drone(exp_dir, 2, derived)
    _save_manifest_drones(exp_dir, [2])
    return exp_dir


def test_pose_at_has_gps_and_ekf_avatars(tmp_path):
    exp_dir = _build_two_gps_fixture(tmp_path)

    result = pose_at(exp_dir, t=0.0)
    avatars = result["drones"]["2"]["avatars"]
    assert "gps" in avatars
    assert "ekf_ned" in avatars
    origin = result["origin"]
    assert origin["lat"] == pytest.approx(32.08, abs=1e-4)
    assert origin["lon"] == pytest.approx(34.78, abs=1e-4)
    assert origin["alt_m"] == pytest.approx(50.0, abs=1e-4)


def test_pose_at_gps_near_origin_at_t0(tmp_path):
    exp_dir = _build_two_gps_fixture(tmp_path)

    result = pose_at(exp_dir, t=0.0)
    gps = result["drones"]["2"]["avatars"]["gps"]
    assert gps["e"] == pytest.approx(0.0, abs=0.01)
    assert gps["n"] == pytest.approx(0.0, abs=0.01)
    assert gps["u"] == pytest.approx(0.0, abs=0.01)


def test_pose_at_gps_one_meter_north_at_later_t(tmp_path):
    exp_dir = _build_two_gps_fixture(tmp_path)

    result = pose_at(exp_dir, t=0.010)
    gps = result["drones"]["2"]["avatars"]["gps"]
    assert gps["n"] == pytest.approx(1.0, abs=0.05)
    assert gps["e"] == pytest.approx(0.0, abs=0.05)
    assert gps["u"] == pytest.approx(0.0, abs=0.05)


def test_ekf_ned_x_is_north_matching_gps_not_swapped_xy(tmp_path):
    """PX4 local x is North. Swapping x/y would send EKF east of a north GPS move."""
    exp_dir = _build_two_gps_fixture(tmp_path)

    result = pose_at(exp_dir, t=0.010)
    ekf = result["drones"]["2"]["avatars"]["ekf_ned"]
    gps = result["drones"]["2"]["avatars"]["gps"]
    assert gps["n"] == pytest.approx(1.0, abs=0.05)
    assert gps["e"] == pytest.approx(0.0, abs=0.05)
    assert ekf["n"] == pytest.approx(1.0, abs=0.05)
    assert ekf["e"] == pytest.approx(0.0, abs=0.05)


def test_pose_at_no_gps_omits_gps_avatar(tmp_path):
    exp_dir = _build_no_gps_fixture(tmp_path)

    result = pose_at(exp_dir, t=0.0)
    d0 = result["drones"]["2"]
    assert "gps" not in d0["avatars"]
    assert "ekf_ned" in d0["avatars"]
    assert d0["local_frame"] is True


def _build_unsynced_gps_fixture(tmp_path, home_rows=None) -> Path:
    exp_dir = tmp_path / "exp"
    exp_dir.mkdir()
    ulg = tmp_path / "drone2.ulg"
    messages = {
        "vehicle_status": [
            {"timestamp": 1000, "arming_state": 1},
        ],
        "vehicle_local_position": [
            {"timestamp": 5000, "x": 0.0, "y": 0.0, "z": 0.0},
        ],
        "vehicle_attitude": [
            {"timestamp": 5000, "q[0]": 1.0, "q[1]": 0.0, "q[2]": 0.0, "q[3]": 0.0},
        ],
        "vehicle_gps_position": [
            {"timestamp": 5000, "lat": 320800000, "lon": 347800000, "alt": 50000},
        ],
    }
    _write_ulog(ulg, messages)
    derived = _extract_drone(exp_dir, 2, ulg)
    write_sync(
        exp_dir,
        {"2": {"ulog_arm_us": None, "sm_arm_local_ts": None, "synced": False}},
    )
    _save_manifest_drones(exp_dir, [2])
    if home_rows is not None:
        pd.DataFrame(home_rows).to_parquet(derived / "home_position.parquet", index=False)
    return exp_dir


def test_unsynced_origin_is_first_gps_not_null_island(tmp_path):
    exp_dir = _build_unsynced_gps_fixture(tmp_path)

    result = pose_at(exp_dir, t=0.0)
    origin = result["origin"]
    assert origin["lat"] == pytest.approx(32.08, abs=1e-4)
    assert origin["lon"] == pytest.approx(34.78, abs=1e-4)
    assert origin["alt_m"] == pytest.approx(50.0, abs=1e-4)
    ekf = result["drones"]["2"]["avatars"]["ekf_ned"]
    assert ekf["e"] == pytest.approx(0.0, abs=1.0)
    assert ekf["n"] == pytest.approx(0.0, abs=1.0)
    assert ekf["u"] == pytest.approx(0.0, abs=1.0)


def test_ekf_skips_wake_up_zero_home(tmp_path):
    exp_dir = _build_unsynced_gps_fixture(
        tmp_path,
        home_rows=[
            {"timestamp": 1000, "lat": 0.0, "lon": 0.0, "alt": 0.0},
            {"timestamp": 5000, "lat": 32.08, "lon": 34.78, "alt": 50.0},
        ],
    )

    result = pose_at(exp_dir, t=0.0)
    origin = result["origin"]
    assert origin["lat"] == pytest.approx(32.08, abs=1e-4)
    assert origin["lon"] == pytest.approx(34.78, abs=1e-4)
    ekf = result["drones"]["2"]["avatars"]["ekf_ned"]
    assert abs(ekf["e"]) < 10.0
    assert abs(ekf["n"]) < 10.0
    assert abs(ekf["u"]) < 10.0
