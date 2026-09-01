"""Replay folders inherit the parent's ulog ARM on rebuild."""

from ea.manifest import load_manifest, save_manifest
from ea.rebuild import rebuild
from ea.store import create_experiment
from ea.ulog_min import write_min_ulog

_STATUS_ARM_5000 = {
    "vehicle_status": [
        {"timestamp": 1000, "arming_state": 1},
        {"timestamp": 5000, "arming_state": 2},
    ],
    "vehicle_local_position": [
        {"timestamp": 5000, "x": 0.0, "y": 0.0, "z": 0.0},
    ],
}

_STATUS_ARM_9000 = {
    "vehicle_status": [
        {"timestamp": 1000, "arming_state": 1},
        {"timestamp": 9000, "arming_state": 2},
    ],
    "vehicle_local_position": [
        {"timestamp": 9000, "x": 0.0, "y": 0.0, "z": 0.0},
    ],
}


def test_rebuild_replay_inherits_parent_ulog_arm(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    created = create_experiment("Replay Sync")
    slug = created["slug"]
    exp_path = created["path"]

    raw_parent = exp_path / "raw" / "drone_2"
    raw_parent.mkdir(parents=True)
    write_min_ulog(raw_parent / "d2.ulg", _STATUS_ARM_5000)

    raw_replay = exp_path / "raw" / "drone_2_r1"
    raw_replay.mkdir(parents=True)
    write_min_ulog(raw_replay / "d2_r1.ulg", _STATUS_ARM_9000)

    manifest_path = exp_path / "manifest.json"
    manifest = load_manifest(manifest_path)
    manifest["drones"] = [
        {
            "id": 2,
            "label": "D2",
            "sources": {"ulg": [], "system_manager": [], "hardware_adapter": []},
        },
        {
            "id": "2_r1",
            "label": "D2_r1",
            "sources": {"ulg": [], "system_manager": [], "hardware_adapter": []},
        },
    ]
    save_manifest(manifest_path, manifest)

    result = rebuild(slug)
    sync = result["sync"]
    assert sync["drones"]["2_r1"]["ulog_arm_us"] == sync["drones"]["2"]["ulog_arm_us"] == 5000
    assert sync["drones"]["2_r1"]["synced"] is True
    assert sync["drones"]["2"]["synced"] is True
