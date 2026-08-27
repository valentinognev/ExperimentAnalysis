"""Manual per-drone time offset tests."""

from pathlib import Path

import pytest

from ea.arm import ulog_arm_us
from ea.extract_ulog import extract_ulog
from ea.manifest import empty_manifest, load_manifest, save_manifest
from ea.pose import pose_at
from ea.sync import t_sm, t_ulog, write_sync
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


def _build_single_drone_fixture(tmp_path) -> Path:
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


def test_manual_offset_shifts_pose(tmp_path):
    exp_dir = _build_single_drone_fixture(tmp_path)

    baseline = pose_at(exp_dir, t=0.0)
    ekf_baseline = baseline["drones"]["2"]["avatars"]["ekf_ned"]

    manifest = load_manifest(exp_dir / "manifest.json")
    manifest["sync"]["manual_offsets_s"] = {"2": 1.5}
    save_manifest(exp_dir / "manifest.json", manifest)

    offset_at = pose_at(exp_dir, t=1.5)
    ekf_offset = offset_at["drones"]["2"]["avatars"]["ekf_ned"]

    assert ekf_offset["e"] == pytest.approx(ekf_baseline["e"], abs=1e-6)
    assert ekf_offset["n"] == pytest.approx(ekf_baseline["n"], abs=1e-6)
    assert ekf_offset["u"] == pytest.approx(ekf_baseline["u"], abs=1e-6)


def test_t_ulog_offset_adds_to_arm_time():
    arm_us = 5000
    first_us = 1000
    assert t_ulog(arm_us, arm_us, first_us, offset_s=1.5) == pytest.approx(1.5)
    assert t_ulog(15000, arm_us, first_us, offset_s=1.5) == pytest.approx(0.01 + 1.5)


def test_t_sm_offset_adds_to_arm_time():
    arm_local = 100.0
    first_local = 50.0
    assert t_sm(arm_local, arm_local, first_local, offset_s=1.5) == pytest.approx(1.5)
    assert t_sm(110.0, arm_local, first_local, offset_s=1.5) == pytest.approx(10.0 + 1.5)
