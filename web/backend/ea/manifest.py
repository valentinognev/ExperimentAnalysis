import copy
import json
from datetime import datetime, timezone
from pathlib import Path

MANIFEST_VERSION = 1


def empty_manifest(name: str) -> dict:
    return {
        "version": MANIFEST_VERSION,
        "name": name,
        "created_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "drones": [],
        "sync": {
            "mode": "arm",
            "t0_label": "ARM (OB takeoff)",
            "manual_offsets_s": {},
        },
        "ui": {
            "engine3d": "plotly",
            "visible_drone_ids": [],
            "avatars": {},
            "vectors": {},
            "plots": [],
            "markers": [],
            "map_linked": True,
        },
    }


def load_manifest(path: Path) -> dict:
    with open(path) as f:
        return json.load(f)


def save_manifest(path: Path, data: dict) -> None:
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")


def _merge_drone(dst: dict, patch: dict) -> dict:
    merged = copy.deepcopy(dst)
    if "ssh" in patch:
        merged["ssh"] = {**merged.get("ssh", {}), **patch["ssh"]}
    if "mavlink" in patch:
        merged["mavlink"] = {**merged.get("mavlink", {}), **patch["mavlink"]}
    if "sources" in patch:
        merged["sources"] = patch["sources"]
    for key, value in patch.items():
        if key not in ("ssh", "mavlink", "sources"):
            merged[key] = value
    return merged


def merge_manifest(dst: dict, patch: dict) -> dict:
    result = copy.deepcopy(dst)
    for key, value in patch.items():
        if key == "ui":
            result["ui"] = {**result.get("ui", {}), **value}
        elif key == "sync":
            result["sync"] = {**result.get("sync", {}), **value}
        elif key == "drones":
            by_id = {d["id"]: d for d in result.get("drones", [])}
            for drone_patch in value:
                drone_id = drone_patch["id"]
                if drone_id in by_id:
                    by_id[drone_id] = _merge_drone(by_id[drone_id], drone_patch)
                else:
                    by_id[drone_id] = copy.deepcopy(drone_patch)
            result["drones"] = list(by_id.values())
        else:
            result[key] = value
    return result
