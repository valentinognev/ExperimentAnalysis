"""Rebuild integration tests for System Manager CSV extract."""

import json
from pathlib import Path

import pandas as pd
import pyarrow.parquet as pq

from ea.rebuild import rebuild
from ea.store import create_experiment

_S4_LOCAL = 11412.04


def _write_sm_csv(path: Path, rows: list[dict]) -> None:
    pd.DataFrame(rows).to_csv(path, index=False)


def test_rebuild_extracts_system_manager_csv_and_sync_arm(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    created = create_experiment("SM Rebuild")
    slug = created["slug"]
    exp_path = created["path"]

    raw_drone = exp_path / "raw" / "drone_2"
    raw_drone.mkdir(parents=True)
    sm_csv = raw_drone / "20260814_070958_system_manager_d2.csv"
    _write_sm_csv(
        sm_csv,
        [
            {"local_ts": 11400.0, "timestamp": 999, "state_machine_state": "S3"},
            {"local_ts": _S4_LOCAL, "timestamp": 1000, "state_machine_state": "S4_TAKEOFF"},
        ],
    )

    result = rebuild(slug)

    parquet = exp_path / "derived" / "drone_2" / "sm_system_manager.parquet"
    assert parquet.is_file()
    df = pq.read_table(parquet).to_pandas()
    assert "S4_TAKEOFF" in df["state_machine_state"].values

    sync_path = exp_path / "derived" / "sync.json"
    assert sync_path.is_file()
    with open(sync_path) as f:
        sync = json.load(f)
    assert sync["drones"]["2"]["sm_arm_local_ts"] == _S4_LOCAL
    assert result["sync"]["drones"]["2"]["sm_arm_local_ts"] == _S4_LOCAL


def test_rebuild_ignores_non_system_manager_d_suffix_csv(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    created = create_experiment("SM Filter")
    slug = created["slug"]
    exp_path = created["path"]

    raw_drone = exp_path / "raw" / "drone_2"
    raw_drone.mkdir(parents=True)
    _write_sm_csv(
        raw_drone / "20260814_system_manager_d2.csv",
        [
            {"local_ts": 11400.0, "state_machine_state": "S3"},
            {"local_ts": _S4_LOCAL, "state_machine_state": "S4_TAKEOFF"},
        ],
    )
    _write_sm_csv(
        raw_drone / "zzz_control_logs_d2.csv",
        [
            {"local_ts": 99999.0, "state_machine_state": "S3"},
        ],
    )

    result = rebuild(slug)

    sm_files = [n["file"] for n in result["drones"]["2"]["sm_extract"]]
    assert sm_files == ["20260814_system_manager_d2.csv"]

    df = pq.read_table(
        exp_path / "derived" / "drone_2" / "sm_system_manager.parquet"
    ).to_pandas()
    assert df["local_ts"].max() == _S4_LOCAL
    assert result["sync"]["drones"]["2"]["sm_arm_local_ts"] == _S4_LOCAL
