"""Logged ENU trajectory for 3D/2D trails, sliced by the client to T."""

from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from ea.arm import ulog_arm_us
from ea.extract_ulog import extract_ulog
from ea.geo import METERS_PER_DEG_LAT
from ea.manifest import empty_manifest, save_manifest
from ea.pose import pose_at
from ea.sync import write_sync
from ea.trajectory import trajectory
from ea.ulog_min import write_min_ulog

_S4_LOCAL = 11412.04
_BASE_LAT = 32.08
_BASE_LON = 34.78
_BASE_ALT = 50.0


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


def _sm_only_fixture(tmp_path) -> Path:
    exp_dir = tmp_path / "exp"
    exp_dir.mkdir()
    derived = exp_dir / "derived" / "drone_2"
    derived.mkdir(parents=True)
    north_lat = _BASE_LAT + 1.0 / METERS_PER_DEG_LAT
    pd.DataFrame(
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
        ]
    ).to_parquet(derived / "sm_system_manager.parquet", index=False)
    write_sync(
        exp_dir,
        {"2": {"ulog_arm_us": None, "sm_arm_local_ts": _S4_LOCAL}},
    )
    _save_manifest_drones(exp_dir, [2])
    return exp_dir


def _build_ekf_fixture(tmp_path, with_gps: bool = False) -> Path:
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
    if with_gps:
        messages["vehicle_gps_position"] = [
            {"timestamp": 5000, "lat": 320800000, "lon": 347800000, "alt": 50000},
            {"timestamp": 15000, "lat": 320800000, "lon": 347800000, "alt": 50000},
        ]
    write_min_ulog(ulg, messages)
    derived = _extract_drone(exp_dir, 2, ulg)
    _write_sync_for_drone(exp_dir, 2, derived)
    _save_manifest_drones(exp_dir, [2])
    return exp_dir


def _point_at(series: dict, t: float) -> dict:
    ts = series["t"]
    i = min(range(len(ts)), key=lambda j: abs(ts[j] - t))
    assert abs(ts[i] - t) < 1e-9
    return {"e": series["e"][i], "n": series["n"][i], "u": series["u"][i]}


def test_trajectory_ekf_matches_pose_at_samples(tmp_path):
    exp_dir = _build_ekf_fixture(tmp_path)
    path = trajectory(exp_dir)
    ekf = path["drones"]["2"]["ekf_ned"]
    assert ekf["t"][0] == pytest.approx(0.0)
    assert ekf["t"][-1] == pytest.approx(0.010)

    for t in (0.0, 0.010):
        pose = pose_at(exp_dir, t)["drones"]["2"]["avatars"]["ekf_ned"]
        pt = _point_at(ekf, t)
        assert pt["e"] == pytest.approx(pose["e"], abs=1e-6)
        assert pt["n"] == pytest.approx(pose["n"], abs=1e-6)
        assert pt["u"] == pytest.approx(pose["u"], abs=1e-6)


def test_trajectory_gps_matches_pose_at(tmp_path):
    exp_dir = _build_ekf_fixture(tmp_path, with_gps=True)
    path = trajectory(exp_dir)
    gps = path["drones"]["2"]["gps"]
    pose = pose_at(exp_dir, 0.0)["drones"]["2"]["avatars"]["gps"]
    pt = _point_at(gps, 0.0)
    assert pt["e"] == pytest.approx(pose["e"], abs=1e-6)
    assert pt["n"] == pytest.approx(pose["n"], abs=1e-6)
    assert pt["u"] == pytest.approx(pose["u"], abs=1e-6)


def test_trajectory_sm_only_emits_sm_sources(tmp_path):
    exp_dir = _sm_only_fixture(tmp_path)
    path = trajectory(exp_dir)
    sources = path["drones"]["2"]
    assert "sm_ned" in sources
    assert "sm_lla" in sources
    assert "ekf_ned" not in sources

    pose = pose_at(exp_dir, 0.0)["drones"]["2"]["avatars"]
    for key in ("sm_ned", "sm_lla"):
        pt = _point_at(sources[key], 0.0)
        assert pt["e"] == pytest.approx(pose[key]["e"], abs=1e-4)
        assert pt["n"] == pytest.approx(pose[key]["n"], abs=1e-4)
        assert pt["u"] == pytest.approx(pose[key]["u"], abs=1e-4)


def test_trajectory_downsamples_to_20hz(tmp_path):
    exp_dir = tmp_path / "exp"
    derived = exp_dir / "derived" / "drone_2"
    derived.mkdir(parents=True)
    n = 1001
    ts_us = 5_000 + np.arange(n) * 1_000
    pd.DataFrame(
        {"timestamp": ts_us, "x": 0.0, "y": 0.0, "z": 0.0}
    ).to_parquet(derived / "vehicle_local_position.parquet", index=False)
    write_sync(exp_dir, {"2": {"ulog_arm_us": 5000, "sm_arm_local_ts": None}})
    _save_manifest_drones(exp_dir, [2])

    ekf = trajectory(exp_dir)["drones"]["2"]["ekf_ned"]
    assert len(ekf["t"]) <= 20 + 2
    assert ekf["t"][0] == pytest.approx(0.0)
    assert ekf["t"][-1] == pytest.approx(1.0)
