"""Vector overlays in pose_at from manifest ui.vectors."""

from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq
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
        derived / "actuator_armed.parquet"
        if (derived / "actuator_armed.parquet").is_file()
        else None,
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


def _save_manifest_with_vectors(exp_dir: Path, drone_id: int) -> None:
    manifest = empty_manifest("test")
    manifest["drones"] = [
        {
            "id": drone_id,
            "label": f"D{drone_id}",
            "sources": {"ulg": [], "system_manager": [], "hardware_adapter": []},
        }
    ]
    manifest["ui"]["vectors"] = {
        str(drone_id): {
            "avatar": "ekf_ned",
            "channels": [
                f"{drone_id}.ulog.vehicle_local_position.vx",
                f"{drone_id}.ulog.vehicle_local_position.vy",
                f"{drone_id}.ulog.vehicle_local_position.vz",
            ],
            "scale": 2.0,
        }
    }
    save_manifest(exp_dir / "manifest.json", manifest)


def _build_vector_fixture(tmp_path) -> Path:
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
                {"timestamp": 15000, "x": 0.0, "y": 0.0, "z": 0.0},
            ],
            "vehicle_attitude": [
                {"timestamp": 5000, "q[0]": 1.0, "q[1]": 0.0, "q[2]": 0.0, "q[3]": 0.0},
                {"timestamp": 15000, "q[0]": 1.0, "q[1]": 0.0, "q[2]": 0.0, "q[3]": 0.0},
            ],
        },
    )
    derived = _extract_drone(exp_dir, 2, ulg)

    # velocity parquet with NED vx=0, vy=1, vz=0 at t=0 (keep x,y,z for pose)
    table = pa.table(
        {
            "timestamp": [5000, 15000],
            "x": [0.0, 0.0],
            "y": [0.0, 0.0],
            "z": [0.0, 0.0],
            "vx": [0.0, 0.0],
            "vy": [1.0, 1.0],
            "vz": [0.0, 0.0],
        }
    )
    pq.write_table(table, derived / "vehicle_local_position.parquet")

    _write_sync_for_drone(exp_dir, 2, derived)
    _save_manifest_with_vectors(exp_dir, 2)
    return exp_dir


def test_vectors_ned_vy_to_enu_e(tmp_path):
    """NED vx=0, vy=1, vz=0 → ENU e=1, n=0, u=0."""
    exp_dir = _build_vector_fixture(tmp_path)
    result = pose_at(exp_dir, t=0.0)
    vel = result["drones"]["2"]["vectors"]["velocity"]
    assert vel["e"] == pytest.approx(1.0, abs=1e-6)
    assert vel["n"] == pytest.approx(0.0, abs=1e-6)
    assert vel["u"] == pytest.approx(0.0, abs=1e-6)


def test_vectors_omitted_without_manifest_config(tmp_path):
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
            ],
            "vehicle_attitude": [
                {"timestamp": 5000, "q[0]": 1.0, "q[1]": 0.0, "q[2]": 0.0, "q[3]": 0.0},
            ],
        },
    )
    derived = _extract_drone(exp_dir, 2, ulg)
    _write_sync_for_drone(exp_dir, 2, derived)
    manifest = empty_manifest("test")
    manifest["drones"] = [
        {
            "id": 2,
            "label": "D2",
            "sources": {"ulg": [], "system_manager": [], "hardware_adapter": []},
        }
    ]
    save_manifest(exp_dir / "manifest.json", manifest)

    result = pose_at(exp_dir, t=0.0)
    assert "vectors" not in result["drones"]["2"]
