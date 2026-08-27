from pathlib import Path

import pandas as pd

from ea.arm import ulog_arm_us


def _write_status(path: Path, rows: list[dict]) -> None:
    pd.DataFrame(rows).to_parquet(path)


def _write_actuator(path: Path, rows: list[dict]) -> None:
    pd.DataFrame(rows).to_parquet(path)


def test_ulog_arm_us_from_vehicle_status(tmp_path):
    status = tmp_path / "vehicle_status.parquet"
    _write_status(
        status,
        [
            {"timestamp": 1000, "arming_state": 1},
            {"timestamp": 5000, "arming_state": 2},
        ],
    )

    assert ulog_arm_us(status, None) == 5000


def test_ulog_arm_us_never_armed(tmp_path):
    status = tmp_path / "vehicle_status.parquet"
    _write_status(
        status,
        [
            {"timestamp": 1000, "arming_state": 1},
            {"timestamp": 5000, "arming_state": 1},
        ],
    )

    assert ulog_arm_us(status, None) is None


def test_ulog_arm_us_actuator_fallback_when_status_never_armed(tmp_path):
    status = tmp_path / "vehicle_status.parquet"
    actuator = tmp_path / "actuator_armed.parquet"
    _write_status(
        status,
        [
            {"timestamp": 1000, "arming_state": 1},
            {"timestamp": 5000, "arming_state": 1},
        ],
    )
    _write_actuator(
        actuator,
        [
            {"timestamp": 2000, "armed": 0},
            {"timestamp": 7000, "armed": 1},
        ],
    )

    assert ulog_arm_us(status, actuator) == 7000


def test_ulog_arm_us_status_wins_over_actuator(tmp_path):
    status = tmp_path / "vehicle_status.parquet"
    actuator = tmp_path / "actuator_armed.parquet"
    _write_status(
        status,
        [
            {"timestamp": 1000, "arming_state": 1},
            {"timestamp": 5000, "arming_state": 2},
        ],
    )
    _write_actuator(
        actuator,
        [
            {"timestamp": 2000, "armed": 0},
            {"timestamp": 9000, "armed": 1},
        ],
    )

    assert ulog_arm_us(status, actuator) == 5000


def test_ulog_arm_us_both_present_neither_armed(tmp_path):
    status = tmp_path / "vehicle_status.parquet"
    actuator = tmp_path / "actuator_armed.parquet"
    _write_status(
        status,
        [
            {"timestamp": 1000, "arming_state": 1},
            {"timestamp": 5000, "arming_state": 1},
        ],
    )
    _write_actuator(
        actuator,
        [
            {"timestamp": 2000, "armed": 0},
            {"timestamp": 7000, "armed": 0},
        ],
    )

    assert ulog_arm_us(status, actuator) is None
