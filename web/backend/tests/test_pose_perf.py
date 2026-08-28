"""pose_at must stay interactive so the Analysis timeline can move 3D avatars."""

from __future__ import annotations

import time
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from ea.pose import _interpolate_attitude, _interpolate_gps_enu


def _dense_attitude(derived: Path, n: int = 40_000) -> None:
    ts = np.arange(n, dtype=np.uint64) * 1000
    pd.DataFrame(
        {
            "timestamp": ts,
            "q[0]": np.ones(n),
            "q[1]": np.zeros(n),
            "q[2]": np.zeros(n),
            "q[3]": np.zeros(n),
        }
    ).to_parquet(derived / "vehicle_attitude.parquet")


def _dense_gps(derived: Path, n: int = 40_000) -> None:
    ts = np.arange(n, dtype=np.uint64) * 1000
    pd.DataFrame(
        {
            "timestamp": ts,
            "latitude_deg": np.full(n, 32.08),
            "longitude_deg": np.full(n, 34.78),
            "altitude_msl_m": np.full(n, 50.0),
        }
    ).to_parquet(derived / "vehicle_gps_position.parquet")


def test_dense_attitude_interpolation_is_interactive(tmp_path):
    derived = tmp_path / "drone_2"
    derived.mkdir()
    _dense_attitude(derived)

    t0 = time.perf_counter()
    q, ok = _interpolate_attitude(derived, arm_us=0, t=10.0)
    elapsed = time.perf_counter() - t0

    assert ok is True
    assert q == pytest.approx((0.0, 0.0, 0.0, 1.0), abs=1e-6)
    assert elapsed < 0.15, (
        f"attitude at T took {elapsed:.3f}s; slider scrub cannot move 3D drones"
    )


def test_dense_gps_interpolation_is_interactive(tmp_path):
    derived = tmp_path / "drone_2"
    derived.mkdir()
    _dense_gps(derived)

    t0 = time.perf_counter()
    enu, ok = _interpolate_gps_enu(
        derived, 0, 10.0, 32.08, 34.78, 50.0
    )
    elapsed = time.perf_counter() - t0

    assert ok is True
    assert enu is not None
    assert enu[0] == pytest.approx(0.0, abs=1e-3)
    assert enu[1] == pytest.approx(0.0, abs=1e-3)
    assert elapsed < 0.15, (
        f"gps at T took {elapsed:.3f}s; slider scrub cannot move 3D drones"
    )
