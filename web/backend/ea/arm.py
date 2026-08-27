"""Detect PX4 ARM timestamp from extracted ulog parquet."""

from __future__ import annotations

from pathlib import Path

import pandas as pd

_S4_STATES = {4, "4", "S4_TAKEOFF"}


def sm_arm_local_ts(df: pd.DataFrame) -> float | None:
    if df.empty or "state_machine_state" not in df.columns or "local_ts" not in df.columns:
        return None
    armed = df.loc[df["state_machine_state"].isin(_S4_STATES)]
    if armed.empty:
        return None
    return float(armed.iloc[0]["local_ts"])


def ulog_arm_us(
    status_parquet: Path | None, actuator_parquet: Path | None
) -> int | None:
    if status_parquet is not None and status_parquet.is_file():
        df = pd.read_parquet(status_parquet)
        if "arming_state" in df.columns:
            armed = df.loc[df["arming_state"] == 2]
            if not armed.empty:
                return int(armed.iloc[0]["timestamp"])

    if actuator_parquet is not None and actuator_parquet.is_file():
        df = pd.read_parquet(actuator_parquet)
        if "armed" in df.columns:
            armed = df.loc[df["armed"].isin([1, True])]
            if not armed.empty:
                return int(armed.iloc[0]["timestamp"])

    return None
