from __future__ import annotations

import shutil
import uuid
from pathlib import Path

from ea.replay.paths import container_replay_root
from ea.replay.ulog_params import inspect_ulog


def container_ulg_path(slug: str, run_id: str) -> str:
    return (
        f"{container_replay_root()}/experiments/{slug}/replay/work/{run_id}/input.ulg"
    )


def inspect_and_stage(
    host_path: Path, work_root: Path, slug: str, ulog_factory=None
) -> dict:
    info = inspect_ulog(host_path, ulog_factory=ulog_factory)
    run_id = uuid.uuid4().hex[:12]
    dest = work_root / run_id / "input.ulg"
    dest.parent.mkdir(parents=True)
    shutil.copy2(host_path, dest)
    return {
        **info,
        "run_id": run_id,
        "host_ulg": str(dest),
        "container_ulg": container_ulg_path(slug, run_id),
    }
