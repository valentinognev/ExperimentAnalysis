from __future__ import annotations

import shutil
from pathlib import Path

from ea.manifest import save_manifest
from ea.replay_id import next_replay_index, replay_id as make_replay_id
from ea.store import open_experiment


def attach_replay(
    slug: str,
    parent_id: int,
    run_id: str,
    original_ulg: Path,
    replayed_ulg: Path,
    overrides: dict,
) -> dict:
    opened = open_experiment(slug)
    exp_path = opened["path"]
    manifest = opened["manifest"]
    existing = [d["id"] for d in manifest.get("drones", [])]
    j = next_replay_index(existing, parent_id)
    rid = make_replay_id(parent_id, j)
    dest_dir = exp_path / "raw" / f"drone_{rid}"
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / f"replayed_r{j}.ulg"
    shutil.copy2(Path(replayed_ulg), dest)
    rel = f"raw/drone_{rid}/replayed_r{j}.ulg"
    drone = {
        "id": rid,
        "kind": "replay",
        "parent_id": parent_id,
        "replay_index": j,
        "label": f"D{rid}",
        "sources": {
            "ulg": [rel],
            "ulg_origin": str(Path(replayed_ulg).resolve()),
            "system_manager": [],
            "hardware_adapter": [],
        },
        "replay": {"run_id": run_id, "overrides": dict(overrides)},
    }
    manifest.setdefault("drones", []).append(drone)
    ui = manifest.setdefault("ui", {})
    visible = ui.setdefault("visible_drone_ids", [])
    if rid not in visible:
        visible.append(rid)
    save_manifest(exp_path / "manifest.json", manifest)
    return {"replay_id": rid, "j": j}
