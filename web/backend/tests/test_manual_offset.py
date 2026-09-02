"""Manual per-drone time offset tests."""

from pathlib import Path

import pandas as pd
import pytest

from ea.arm import ulog_arm_us
from ea.extract_ulog import extract_ulog
from ea.geo import METERS_PER_DEG_LAT
from ea.manifest import empty_manifest, load_manifest, save_manifest
from ea.pose import pose_at
from ea.sync import t_sm, t_ulog, write_sync
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

    manifest = load_manifest(exp_dir / "manifest.json")
    manifest["sync"]["mode"] = "manual"
    manifest["sync"]["manual_offsets_s"] = {}
    save_manifest(exp_dir / "manifest.json", manifest)

    # First-sample mapping (ARM ignored): t_ulog(5000, None, 1000) = 0.004
    baseline = pose_at(exp_dir, t=0.004)
    ekf_baseline = baseline["drones"]["2"]["avatars"]["ekf_ned"]

    manifest["sync"]["manual_offsets_s"] = {"2": 1.5}
    save_manifest(exp_dir / "manifest.json", manifest)

    # With offset 1.5, same pose at 0.004 + 1.5 = 1.504
    offset_at = pose_at(exp_dir, t=1.504)
    ekf_offset = offset_at["drones"]["2"]["avatars"]["ekf_ned"]

    assert ekf_offset["e"] == pytest.approx(ekf_baseline["e"], abs=1e-6)
    assert ekf_offset["n"] == pytest.approx(ekf_baseline["n"], abs=1e-6)
    assert ekf_offset["u"] == pytest.approx(ekf_baseline["u"], abs=1e-6)


def test_arm_mode_ignores_manual_offsets(tmp_path):
    exp_dir = _build_single_drone_fixture(tmp_path)

    baseline = pose_at(exp_dir, t=0.0)
    ekf_baseline = baseline["drones"]["2"]["avatars"]["ekf_ned"]

    manifest = load_manifest(exp_dir / "manifest.json")
    manifest["sync"]["mode"] = "arm"
    manifest["sync"]["manual_offsets_s"] = {"2": 1.5}
    save_manifest(exp_dir / "manifest.json", manifest)

    at_arm = pose_at(exp_dir, t=0.0)
    ekf = at_arm["drones"]["2"]["avatars"]["ekf_ned"]
    assert ekf["e"] == pytest.approx(ekf_baseline["e"], abs=1e-6)
    assert ekf["n"] == pytest.approx(ekf_baseline["n"], abs=1e-6)
    assert ekf["u"] == pytest.approx(ekf_baseline["u"], abs=1e-6)


def test_manual_mode_pose_uses_first_sample_not_arm(tmp_path):
    exp_dir = _build_single_drone_fixture(tmp_path)

    arm_ekf = pose_at(exp_dir, t=0.0)["drones"]["2"]["avatars"]["ekf_ned"]

    manifest = load_manifest(exp_dir / "manifest.json")
    manifest["sync"]["mode"] = "manual"
    manifest["sync"]["manual_offsets_s"] = {}
    save_manifest(exp_dir / "manifest.json", manifest)

    # Prefer present gating when first_us is earlier than LP; else EKF fallback.
    at_zero = pose_at(exp_dir, t=0.0)
    mapped_t = (5000 - 1000) / 1e6
    if at_zero["drones"]["2"]["present"] is False:
        assert pose_at(exp_dir, t=mapped_t)["drones"]["2"]["present"] is True
    else:
        # Per-topic first sample: LP starts at 5000 (= ARM us), so manual T=0
        # matches ARM-mode pose at t=0 (ARM anchors dropped but same sample).
        ekf = at_zero["drones"]["2"]["avatars"]["ekf_ned"]
        assert ekf["e"] == pytest.approx(arm_ekf["e"], abs=1e-6)
        assert ekf["n"] == pytest.approx(arm_ekf["n"], abs=1e-6)
        assert ekf["u"] == pytest.approx(arm_ekf["u"], abs=1e-6)


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


def _offset_north_lat_deg(base_lat: float, meters: float) -> float:
    return base_lat + meters / METERS_PER_DEG_LAT


def _sm_ned_offset_fixture(tmp_path) -> Path:
    exp_dir = tmp_path / "exp"
    exp_dir.mkdir()
    ulg = tmp_path / "drone2.ulg"
    base_lat_int = int(round(_BASE_LAT * 1e7))
    base_lon_int = int(round(_BASE_LON * 1e7))
    base_alt_int = int(round(_BASE_ALT * 1000))
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
            "vehicle_gps_position": [
                {"timestamp": 5000, "lat": base_lat_int, "lon": base_lon_int, "alt": base_alt_int},
            ],
        },
    )
    derived = _extract_drone(exp_dir, 2, ulg)
    arm_lla_lat = _offset_north_lat_deg(_BASE_LAT, 10.0)
    pd.DataFrame(
        [
            {
                "local_ts": _S4_LOCAL - 1.5,
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
                "state_machine_state": "S4_TAKEOFF",
                "pos_ned/x": 0.0,
                "pos_ned/y": 0.0,
                "pos_ned/z": 0.0,
                "lla/lat_deg": arm_lla_lat,
                "lla/lon_deg": _BASE_LON,
                "lla/alt": _BASE_ALT,
            },
        ]
    ).to_parquet(derived / "sm_system_manager.parquet", index=False)
    write_sync(
        exp_dir,
        {
            "2": {
                "ulog_arm_us": ulog_arm_us(derived / "vehicle_status.parquet", None),
                "sm_arm_local_ts": _S4_LOCAL,
            },
        },
    )
    _save_manifest_drones(exp_dir, [2])
    return exp_dir


def test_manual_offset_sm_ned_reference_lla_at_arm(tmp_path):
    """ARM mode: offsets ignored; SM NED spatial ref still at ARM."""
    exp_dir = _sm_ned_offset_fixture(tmp_path)

    baseline = pose_at(exp_dir, t=0.0)
    sm_ned_baseline = baseline["drones"]["2"]["avatars"]["sm_ned"]
    assert sm_ned_baseline["n"] == pytest.approx(10.0, abs=0.05)

    manifest = load_manifest(exp_dir / "manifest.json")
    manifest["sync"]["mode"] = "arm"
    manifest["sync"]["manual_offsets_s"] = {"2": 1.5}
    save_manifest(exp_dir / "manifest.json", manifest)

    # Offsets ignored in ARM mode — pose at T=0 unchanged
    at_arm = pose_at(exp_dir, t=0.0)
    sm_ned = at_arm["drones"]["2"]["avatars"]["sm_ned"]
    assert sm_ned["n"] == pytest.approx(sm_ned_baseline["n"], abs=0.05)
    assert sm_ned["n"] != pytest.approx(0.0, abs=0.05)
