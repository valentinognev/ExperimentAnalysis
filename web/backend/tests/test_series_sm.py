"""SM source series uses local_ts + t_sm, not ulog timestamp."""

from pathlib import Path

import pandas as pd
import pytest

from ea.manifest import empty_manifest, save_manifest
from ea.series import series
from ea.sync import write_sync


def test_sm_channel_series_uses_local_ts_not_ulog_timestamp(tmp_path):
    exp_dir = tmp_path / "exp"
    derived = exp_dir / "derived" / "drone_2"
    derived.mkdir(parents=True)

    manifest = empty_manifest("sm-series")
    manifest["drones"] = [
        {
            "id": 2,
            "label": "D2",
            "sources": {"ulg": [], "system_manager": [], "hardware_adapter": []},
        }
    ]
    save_manifest(exp_dir / "manifest.json", manifest)

    sm_arm = 100.0
    pd.DataFrame(
        [
            {"local_ts": 100.0, "timestamp": 9_999_999, "pos_ned/x": 0.0},
            {"local_ts": 110.0, "timestamp": 9_999_999, "pos_ned/x": 1.0},
        ]
    ).to_parquet(derived / "sm_system_manager.parquet", index=False)

    write_sync(
        exp_dir,
        {"2": {"ulog_arm_us": None, "sm_arm_local_ts": sm_arm}},
    )

    channel = "2.sm.sm_system_manager.pos_ned/x"
    result = series(exp_dir, [channel])
    ch = result[channel]

    assert ch["t"][0] == pytest.approx(0.0, abs=1e-6)
    assert ch["t"][-1] == pytest.approx(10.0, abs=1e-6)
    assert ch["y"][-1] == pytest.approx(1.0, abs=1e-6)
