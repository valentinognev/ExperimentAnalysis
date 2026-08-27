"""Extract ULog topics to Parquet files."""

from __future__ import annotations

from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq
from pyulog import ULog

ALWAYS = (
    "vehicle_local_position",
    "vehicle_gps_position",
    "vehicle_attitude",
    "vehicle_status",
    "home_position",
)


def extract_ulog(ulg_path: Path, dest_dir: Path, extra_topics: tuple[str, ...] = ()) -> list[str]:
    dest_dir.mkdir(parents=True, exist_ok=True)
    ulog = ULog(str(ulg_path))
    names = {d.name for d in ulog.data_list}
    topics = [t for t in ALWAYS if t in names]
    if "vehicle_gps_position" not in names and "vehicle_global_position" in names:
        topics.append("vehicle_global_position")
    for t in extra_topics:
        if t in names and t not in topics:
            topics.append(t)
    written = []
    for t in topics:
        ds = ulog.get_dataset(t)
        table = pa.table(ds.data)
        pq.write_table(table, dest_dir / f"{t}.parquet")
        written.append(t)
    return written
