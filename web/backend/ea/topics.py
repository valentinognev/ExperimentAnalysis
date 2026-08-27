"""Topic tree from derived parquet."""

from __future__ import annotations

from pathlib import Path

import pandas as pd

_HA_DIR = "derived/ha"
_SM_PARQUET = "sm_system_manager.parquet"


def _ulog_topics_for_drone(experiment_dir: Path, drone_id: str) -> dict[str, list[str]]:
    derived = experiment_dir / "derived" / f"drone_{drone_id}"
    if not derived.is_dir():
        return {}

    topics: dict[str, list[str]] = {}
    for parquet_path in sorted(derived.glob("*.parquet")):
        if parquet_path.stem.startswith("sm_"):
            continue
        topic = parquet_path.stem
        df = pd.read_parquet(parquet_path, columns=None)
        fields = [c for c in df.columns if c != "timestamp"]
        if fields:
            topics[topic] = sorted(fields)
    return topics


def _sm_topics_for_drone(experiment_dir: Path, drone_id: str) -> dict[str, list[str]]:
    parquet_path = (
        experiment_dir / "derived" / f"drone_{drone_id}" / _SM_PARQUET
    )
    if not parquet_path.is_file():
        return {}

    df = pd.read_parquet(parquet_path, columns=None)
    fields = [c for c in df.columns if c not in ("timestamp", "local_ts")]
    if not fields:
        return {}
    return {_SM_PARQUET.removesuffix(".parquet"): sorted(fields)}


def _ha_topics_for_drone(experiment_dir: Path, drone_id: str) -> dict[str, list[str]]:
    base = experiment_dir / _HA_DIR / f"drone_{drone_id}"
    if not base.is_dir():
        return {}

    topics: dict[str, list[str]] = {}
    for parquet_path in sorted(base.glob("*.parquet")):
        topic = parquet_path.stem
        df = pd.read_parquet(parquet_path, columns=None)
        fields = [c for c in df.columns if c != "timestamp"]
        if fields:
            topics[topic] = sorted(fields)
    return topics


def list_topics(experiment_dir: Path) -> dict:
    derived_root = experiment_dir / "derived"
    if not derived_root.is_dir():
        return {}

    drone_ids: set[str] = set()
    for pattern in ("drone_*", "ha/drone_*"):
        for drone_dir in derived_root.glob(pattern):
            if drone_dir.is_dir():
                drone_ids.add(drone_dir.name.split("_", 1)[1])

    tree: dict[str, dict] = {}
    for drone_id in sorted(drone_ids, key=lambda x: (not x.isdigit(), int(x) if x.isdigit() else x)):
        sources: dict[str, dict[str, list[str]]] = {}
        ulog_topics = _ulog_topics_for_drone(experiment_dir, drone_id)
        if ulog_topics:
            sources["ulog"] = ulog_topics

        sm_topics = _sm_topics_for_drone(experiment_dir, drone_id)
        if sm_topics:
            sources["sm"] = sm_topics

        ha_topics = _ha_topics_for_drone(experiment_dir, drone_id)
        if ha_topics:
            sources["ha"] = ha_topics

        if sources:
            tree[drone_id] = sources

    return tree
