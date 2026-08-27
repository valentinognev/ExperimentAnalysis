"""experiment_t_max_s and duration API."""

from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq
import pytest
from fastapi.testclient import TestClient

from app import app
from ea.arm import ulog_arm_us
from ea.duration import experiment_t_max_s
from ea.manifest import empty_manifest, save_manifest
from ea.sync import write_sync


def _save_manifest(exp_dir: Path, drone_ids: list[int]) -> None:
    manifest = empty_manifest("dur")
    manifest["drones"] = [
        {
            "id": did,
            "label": f"D{did}",
            "sources": {"ulg": [], "system_manager": [], "hardware_adapter": []},
        }
        for did in drone_ids
    ]
    save_manifest(exp_dir / "manifest.json", manifest)


def test_t_max_exceeds_sixty_for_long_ulog_fixture(tmp_path):
    exp_dir = tmp_path / "exp"
    derived = exp_dir / "derived" / "drone_2"
    derived.mkdir(parents=True)

    arm_us = 5_000_000
    timestamps = [arm_us + int(t * 1e6) for t in (0.0, 30.0, 95.5)]
    table = pa.table(
        {
            "timestamp": timestamps,
            "x": [0.0, 1.0, 2.0],
            "y": [0.0, 0.0, 0.0],
            "z": [0.0, 0.0, 0.0],
        }
    )
    pq.write_table(table, derived / "vehicle_local_position.parquet")
    pq.write_table(
        pa.table({"timestamp": [1_000, arm_us], "arming_state": [1, 2]}),
        derived / "vehicle_status.parquet",
    )

    write_sync(
        exp_dir,
        {
            "2": {
                "ulog_arm_us": ulog_arm_us(
                    derived / "vehicle_status.parquet",
                    None,
                ),
                "sm_arm_local_ts": None,
            },
        },
    )
    _save_manifest(exp_dir, [2])

    t_max = experiment_t_max_s(exp_dir)
    assert t_max > 60
    assert t_max == pytest.approx(95.0, abs=1.0)


def test_duration_api(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    exp_dir = tmp_path / "Dur"
    derived = exp_dir / "derived" / "drone_2"
    derived.mkdir(parents=True)
    (exp_dir / "raw").mkdir()
    arm_us = 5_000_000
    pq.write_table(
        pa.table(
            {
                "timestamp": [arm_us, arm_us + 75_000_000],
                "x": [0.0, 1.0],
                "y": [0.0, 0.0],
                "z": [0.0, 0.0],
            }
        ),
        derived / "vehicle_local_position.parquet",
    )
    pq.write_table(
        pa.table({"timestamp": [1_000, arm_us], "arming_state": [1, 2]}),
        derived / "vehicle_status.parquet",
    )
    write_sync(
        exp_dir,
        {
            "2": {
                "ulog_arm_us": arm_us,
                "sm_arm_local_ts": None,
            },
        },
    )
    _save_manifest(exp_dir, [2])

    c = TestClient(app)
    r = c.get("/api/experiments/Dur/duration")
    assert r.status_code == 200
    assert r.json()["t_max_s"] > 60
