from pathlib import Path

import pandas as pd
import pyarrow.parquet as pq

from ea.arm import sm_arm_local_ts
from ea.extract_sm import extract_sm
from ea.sync import t_sm, t_ulog

_S4_LOCAL = 11412.04


def _write_sm_csv(path: Path, rows: list[dict]) -> None:
    pd.DataFrame(rows).to_csv(path, index=False)


def test_extract_sm_s4_takeoff_parquet_and_arm(tmp_path):
    csv = tmp_path / "20260814_system_manager_d2.csv"
    dest = tmp_path / "derived" / "drone_2"
    _write_sm_csv(
        csv,
        [
            {"local_ts": 11400.0, "timestamp": 999, "state_machine_state": "S3"},
            {"local_ts": _S4_LOCAL, "timestamp": 1000, "state_machine_state": "S4_TAKEOFF"},
        ],
    )

    out = extract_sm(csv, dest)

    assert out == dest / "sm_system_manager.parquet"
    assert out.is_file()
    table = pq.read_table(out)
    assert "local_ts" in table.column_names
    assert "state_machine_state" in table.column_names
    df = table.to_pandas()
    assert sm_arm_local_ts(df) == _S4_LOCAL


def test_sm_arm_local_ts_no_s4_returns_none():
    df = pd.DataFrame(
        [
            {"local_ts": 11400.0, "state_machine_state": "S3"},
            {"local_ts": 11401.0, "state_machine_state": "OFFBOARD"},
        ]
    )
    assert sm_arm_local_ts(df) is None


def test_sm_arm_local_ts_numeric_four_counts_as_arm():
    arm_local = 200.5
    df = pd.DataFrame(
        [
            {"local_ts": 100.0, "state_machine_state": 3},
            {"local_ts": arm_local, "state_machine_state": 4},
        ]
    )
    assert sm_arm_local_ts(df) == arm_local


def test_pi_fc_t_zero_alignment_same_experiment_t():
    arm_us = 5_000_000
    first_us = 1_000_000
    s4_local = _S4_LOCAL
    first_local = 10_000.0
    assert t_ulog(arm_us, arm_us, first_us) == 0
    assert t_sm(s4_local, s4_local, first_local) == 0
