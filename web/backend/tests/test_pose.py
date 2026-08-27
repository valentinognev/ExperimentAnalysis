"""pose_at query builder tests."""

from pathlib import Path

import pytest

from ea.arm import ulog_arm_us
from ea.extract_ulog import extract_ulog
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


def _build_single_drone_fixture(tmp_path, with_gps: bool = False) -> Path:
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
        ]
    _write_ulog(ulg, messages)
    derived = _extract_drone(exp_dir, 2, ulg)
    _write_sync_for_drone(exp_dir, 2, derived)
    _save_manifest_drones(exp_dir, [2])
    return exp_dir


def test_pose_at_single_drone_interpolation(tmp_path):
    exp_dir = _build_single_drone_fixture(tmp_path)

    at_zero = pose_at(exp_dir, t=0.0)
    assert at_zero["t"] == 0.0
    assert "2" in at_zero["drones"]
    d0 = at_zero["drones"]["2"]
    assert d0["present"] is True
    assert d0["synced"] is True
    ekf0 = d0["avatars"]["ekf_ned"]
    assert ekf0["e"] == pytest.approx(0.0, abs=1e-6)
    assert ekf0["n"] == pytest.approx(0.0, abs=1e-6)
    assert ekf0["u"] == pytest.approx(0.0, abs=1e-6)
    assert d0["attitude_q_xyzw"] == pytest.approx([0.0, 0.0, 0.0, 1.0], abs=1e-6)

    at_mid = pose_at(exp_dir, t=0.005)
    ekf_mid = at_mid["drones"]["2"]["avatars"]["ekf_ned"]
    assert ekf_mid["e"] == pytest.approx(0.0, abs=1e-6)
    assert ekf_mid["n"] == pytest.approx(0.5, abs=1e-6)
    assert ekf_mid["u"] == pytest.approx(0.0, abs=1e-6)

    at_end = pose_at(exp_dir, t=0.010)
    ekf_end = at_end["drones"]["2"]["avatars"]["ekf_ned"]
    assert ekf_end["n"] == pytest.approx(1.0, abs=1e-6)

    at_far = pose_at(exp_dir, t=99.0)
    assert at_far["drones"]["2"]["present"] is False


def test_pose_at_ned_y_to_e_and_z_to_u(tmp_path):
    exp_dir = tmp_path / "exp"
    exp_dir.mkdir()
    ulg = tmp_path / "drone2.ulg"
    _write_ulog(
        ulg,
        {
            "vehicle_status": [
                {"timestamp": 1000, "arming_state": 1},
                {"timestamp": 5000, "arming_state": 2},
            ],
            "vehicle_local_position": [
                {"timestamp": 5000, "x": 0.0, "y": 0.0, "z": 0.0},
                {"timestamp": 15000, "x": 0.0, "y": 2.0, "z": 3.0},
            ],
            "vehicle_attitude": [
                {"timestamp": 5000, "q[0]": 1.0, "q[1]": 0.0, "q[2]": 0.0, "q[3]": 0.0},
                {"timestamp": 15000, "q[0]": 1.0, "q[1]": 0.0, "q[2]": 0.0, "q[3]": 0.0},
            ],
        },
    )
    derived = _extract_drone(exp_dir, 2, ulg)
    _write_sync_for_drone(exp_dir, 2, derived)
    _save_manifest_drones(exp_dir, [2])

    at_zero = pose_at(exp_dir, t=0.0)
    ekf0 = at_zero["drones"]["2"]["avatars"]["ekf_ned"]
    assert ekf0["e"] == pytest.approx(0.0, abs=1e-6)
    assert ekf0["n"] == pytest.approx(0.0, abs=1e-6)
    assert ekf0["u"] == pytest.approx(0.0, abs=1e-6)

    at_end = pose_at(exp_dir, t=0.010)
    ekf_end = at_end["drones"]["2"]["avatars"]["ekf_ned"]
    assert ekf_end["e"] == pytest.approx(2.0, abs=1e-6)
    assert ekf_end["n"] == pytest.approx(0.0, abs=1e-6)
    assert ekf_end["u"] == pytest.approx(-3.0, abs=1e-6)


def test_pose_at_partial_manifest(tmp_path):
    exp_dir = tmp_path / "exp"
    exp_dir.mkdir()

    for drone_id in (2, 4):
        ulg = tmp_path / f"drone{drone_id}.ulg"
        _write_ulog(
            ulg,
            {
                "vehicle_status": [
                    {"timestamp": 1000, "arming_state": 1},
                    {"timestamp": 5000, "arming_state": 2},
                ],
                "vehicle_local_position": [
                    {"timestamp": 5000, "x": 0.0, "y": 0.0, "z": 0.0},
                ],
                "vehicle_attitude": [
                    {"timestamp": 5000, "q[0]": 1.0, "q[1]": 0.0, "q[2]": 0.0, "q[3]": 0.0},
                ],
            },
        )
        _extract_drone(exp_dir, drone_id, ulg)

    per_drone = {}
    for drone_id in (2, 4):
        derived = exp_dir / "derived" / f"drone_{drone_id}"
        arm_us = ulog_arm_us(derived / "vehicle_status.parquet", None)
        per_drone[str(drone_id)] = {
            "ulog_arm_us": arm_us,
            "sm_arm_local_ts": None,
        }
    write_sync(exp_dir, per_drone)
    _save_manifest_drones(exp_dir, [2, 3, 4])

    result = pose_at(exp_dir, t=0.0)
    assert "2" in result["drones"]
    assert "3" in result["drones"]
    assert "4" in result["drones"]
    assert result["drones"]["2"]["present"] is True
    assert result["drones"]["3"]["present"] is False
    assert result["drones"]["4"]["present"] is True


def test_pose_at_gps_origin_scaling(tmp_path):
    exp_dir = _build_single_drone_fixture(tmp_path, with_gps=True)

    result = pose_at(exp_dir, t=0.0)
    origin = result["origin"]
    assert origin["lat"] == pytest.approx(32.08, abs=1e-4)
    assert origin["lon"] == pytest.approx(34.78, abs=1e-4)
    assert origin["alt_m"] == pytest.approx(50.0, abs=1e-4)
    assert result["drones"]["2"].get("local_frame") is not True


def test_pose_at_no_gps_local_frame(tmp_path):
    exp_dir = _build_single_drone_fixture(tmp_path, with_gps=False)

    result = pose_at(exp_dir, t=0.0)
    assert result["origin"] == {"lat": 0.0, "lon": 0.0, "alt_m": 0.0}
    assert result["drones"]["2"]["local_frame"] is True
