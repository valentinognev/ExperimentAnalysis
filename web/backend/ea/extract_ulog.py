"""Extract ULog topics to Parquet files."""

from __future__ import annotations

from collections import Counter
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


def _topic_key(name: str, multi_id: int, counts: Counter[str]) -> str:
    if counts[name] > 1:
        return f"{name}.{int(multi_id):02d}"
    return name


def extract_ulog(ulg_path: Path, dest_dir: Path, extra_topics: tuple[str, ...] = ()) -> list[str]:
    dest_dir.mkdir(parents=True, exist_ok=True)
    for old in dest_dir.glob("*.parquet"):
        if not old.stem.startswith("sm_"):
            old.unlink()

    ulog = ULog(str(ulg_path))
    counts = Counter(d.name for d in ulog.data_list)
    written: list[str] = []
    for ds in ulog.data_list:
        if not ds.data:
            continue
        key = _topic_key(ds.name, ds.multi_id, counts)
        table = pa.table(ds.data)
        pq.write_table(table, dest_dir / f"{key}.parquet")
        written.append(key)

    return written
