"""Topic tree from derived parquet."""

from __future__ import annotations

from pathlib import Path

import pandas as pd

_SOURCE_DIRS = {
    "ulog": "derived",
    "sm": "derived/sm",
    "ha": "derived/ha",
}


def _ulog_topics_for_drone(experiment_dir: Path, drone_id: str) -> dict[str, list[str]]:
    derived = experiment_dir / "derived" / f"drone_{drone_id}"
    if not derived.is_dir():
        return {}

    topics: dict[str, list[str]] = {}
    for parquet_path in sorted(derived.glob("*.parquet")):
        topic = parquet_path.stem
        df = pd.read_parquet(parquet_path, columns=None)
        fields = [c for c in df.columns if c != "timestamp"]
        if fields:
            topics[topic] = sorted(fields)
    return topics


def _sm_ha_topics_for_drone(experiment_dir: Path, drone_id: str, source: str) -> dict[str, list[str]]:
    subdir = _SOURCE_DIRS[source]
    base = experiment_dir / subdir / f"drone_{drone_id}"
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

    tree: dict[str, dict] = {}
    for drone_dir in sorted(derived_root.glob("drone_*")):
        if not drone_dir.is_dir():
            continue
        drone_id = drone_dir.name.split("_", 1)[1]

        sources: dict[str, dict[str, list[str]]] = {}
        ulog_topics = _ulog_topics_for_drone(experiment_dir, drone_id)
        if ulog_topics:
            sources["ulog"] = ulog_topics

        sm_topics = _sm_ha_topics_for_drone(experiment_dir, drone_id, "sm")
        if sm_topics:
            sources["sm"] = sm_topics

        ha_topics = _sm_ha_topics_for_drone(experiment_dir, drone_id, "ha")
        if ha_topics:
            sources["ha"] = ha_topics

        if sources:
            tree[drone_id] = sources

    return tree
