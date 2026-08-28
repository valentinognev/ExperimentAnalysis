"""series() and list_topics() tests."""

from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq
import pytest

from ea.arm import ulog_arm_us
from ea.extract_ulog import extract_ulog
from ea.manifest import empty_manifest, save_manifest
from ea.series import series
from ea.sync import write_sync
from ea.topics import list_topics
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


def test_series_local_position_x_at_arm(tmp_path):
    exp_dir = _build_single_drone_fixture(tmp_path)
    channel = "2.ulog.vehicle_local_position.x"
    result = series(exp_dir, [channel])

    assert channel in result
    ch = result[channel]
    assert ch["t"][0] == pytest.approx(0.0, abs=1e-6)
    assert ch["y"][0] == pytest.approx(0.0, abs=1e-6)
    assert ch["t"][-1] == pytest.approx(0.010, abs=1e-6)
    assert ch["y"][-1] == pytest.approx(1.0, abs=1e-6)


def test_series_invalid_channel_empty_arrays(tmp_path):
    exp_dir = _build_single_drone_fixture(tmp_path)
    channel = "9.ulog.nope.x"
    result = series(exp_dir, [channel])

    assert channel in result
    assert result[channel] == {"t": [], "y": []}


def test_series_reads_multi_instance_topic(tmp_path):
    exp_dir = tmp_path / "exp"
    exp_dir.mkdir()
    derived = exp_dir / "derived" / "drone_2"
    derived.mkdir(parents=True)
    arm_us = 5000
    pq.write_table(
        pa.table({"timestamp": [arm_us, arm_us + 1000], "x": [1.5, 2.5]}),
        derived / "sensor_accel.00.parquet",
    )
    write_sync(exp_dir, {"2": {"ulog_arm_us": arm_us, "sm_arm_local_ts": None}})
    _save_manifest_drones(exp_dir, [2])

    channel = "2.ulog.sensor_accel.00.x"
    result = series(exp_dir, [channel])
    assert result[channel]["y"] == [1.5, 2.5]
    assert result[channel]["t"][0] == pytest.approx(0.0, abs=1e-6)


def test_list_topics_includes_local_position_x(tmp_path):
    exp_dir = _build_single_drone_fixture(tmp_path)
    tree = list_topics(exp_dir)

    assert "2" in tree
    assert "ulog" in tree["2"]
    assert "vehicle_local_position" in tree["2"]["ulog"]
    assert "x" in tree["2"]["ulog"]["vehicle_local_position"]


def test_series_t0_t1_window(tmp_path):
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
                {"timestamp": 55000, "x": 0.5, "y": 0.0, "z": 0.0},
                {"timestamp": 105000, "x": 1.0, "y": 0.0, "z": 0.0},
            ],
            "vehicle_attitude": [
                {"timestamp": 5000, "q[0]": 1.0, "q[1]": 0.0, "q[2]": 0.0, "q[3]": 0.0},
            ],
        },
    )
    derived = _extract_drone(exp_dir, 2, ulg)
    _write_sync_for_drone(exp_dir, 2, derived)
    _save_manifest_drones(exp_dir, [2])

    channel = "2.ulog.vehicle_local_position.x"
    result = series(exp_dir, [channel], t0=0.05, t1=0.10)

    ch = result[channel]
    assert all(0.05 <= t <= 0.10 for t in ch["t"])
    assert len(ch["t"]) == 2
    assert ch["t"][0] == pytest.approx(0.05, abs=1e-6)
    assert ch["t"][-1] == pytest.approx(0.10, abs=1e-6)


def test_series_downsample_dense_local_position(tmp_path):
    exp_dir = tmp_path / "exp"
    exp_dir.mkdir()
    derived = exp_dir / "derived" / "drone_2"
    derived.mkdir(parents=True)

    arm_us = 5000
    timestamps = [arm_us + i * 1000 for i in range(100)]
    x_vals = [float(i) for i in range(100)]
    table = pa.table({"timestamp": timestamps, "x": x_vals, "y": [0.0] * 100, "z": [0.0] * 100})
    pq.write_table(table, derived / "vehicle_local_position.parquet")

    # vehicle_status for sync (minimal)
    status_table = pa.table(
        {"timestamp": [1000, arm_us], "arming_state": [1, 2]}
    )
    pq.write_table(status_table, derived / "vehicle_status.parquet")

    write_sync(
        exp_dir,
        {"2": {"ulog_arm_us": arm_us, "sm_arm_local_ts": None}},
    )
    _save_manifest_drones(exp_dir, [2])

    channel = "2.ulog.vehicle_local_position.x"
    result = series(exp_dir, [channel])
    ch = result[channel]

    max_samples = int(0.1 * 20) + 2
    assert len(ch["t"]) <= max_samples
    assert ch["t"][0] == pytest.approx(0.0, abs=1e-6)
    assert ch["t"][-1] == pytest.approx(0.099, abs=1e-3)
