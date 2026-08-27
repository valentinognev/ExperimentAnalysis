"""SM topics from derived/drone_*/sm_system_manager.parquet; exclude from ulog."""

from pathlib import Path

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

from ea.topics import list_topics


def test_sm_parquet_not_listed_under_ulog(tmp_path):
    exp_dir = tmp_path / "exp"
    derived = exp_dir / "derived" / "drone_2"
    derived.mkdir(parents=True)

    pq.write_table(
        pa.table({"timestamp": [1], "x": [0.0]}),
        derived / "vehicle_local_position.parquet",
    )
    pd.DataFrame([{"local_ts": 1.0, "state_machine_state": "S3"}]).to_parquet(
        derived / "sm_system_manager.parquet",
        index=False,
    )

    tree = list_topics(exp_dir)
    assert "2" in tree
    assert "sm_system_manager" not in tree["2"].get("ulog", {})
    assert "sm" in tree["2"]
    assert "sm_system_manager" in tree["2"]["sm"]
    assert "state_machine_state" in tree["2"]["sm"]["sm_system_manager"]
