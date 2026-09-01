from pathlib import Path

from ea.manifest import load_manifest
from ea.replay.attach import attach_replay
from ea.store import create_experiment, set_drone_count
from ea.ulog_min import write_min_ulog


def _orig(tmp_path: Path) -> Path:
    p = tmp_path / "orig.ulg"
    write_min_ulog(
        p,
        {"vehicle_local_position": [{"timestamp": 0, "x": 0.0, "y": 0.0, "z": 0.0}]},
    )
    return p


def _setup_s(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    create_experiment("S")
    set_drone_count("S", 2)
    orig = _orig(tmp_path)
    replayed = tmp_path / "x_replayed.ulg"
    replayed.write_bytes(b"replay-bytes")
    return orig, replayed


def test_attach_copies_replayed_and_appends_manifest(tmp_path, monkeypatch):
    orig, replayed = _setup_s(tmp_path, monkeypatch)
    opened_ui = load_manifest(tmp_path / "S" / "manifest.json")
    opened_ui["ui"]["visible_drone_ids"] = [1, 2]
    from ea.manifest import save_manifest

    save_manifest(tmp_path / "S" / "manifest.json", opened_ui)

    result = attach_replay("S", 2, "abc", orig, replayed, {"EKF2_X": 1})
    assert result == {"replay_id": "2_r1", "j": 1}

    dest = tmp_path / "S" / "raw" / "drone_2_r1" / "replayed_r1.ulg"
    assert dest.is_file()
    assert dest.read_bytes() == b"replay-bytes"
    assert list((tmp_path / "S" / "raw" / "drone_2_r1").iterdir()) == [dest]

    slugs = [
        p.name
        for p in tmp_path.iterdir()
        if p.is_dir() and (p / "manifest.json").is_file()
    ]
    assert slugs == ["S"]

    manifest = load_manifest(tmp_path / "S" / "manifest.json")
    drone = next(d for d in manifest["drones"] if d["id"] == "2_r1")
    assert drone["kind"] == "replay"
    assert drone["parent_id"] == 2
    assert drone["replay_index"] == 1
    assert drone["label"] == "D2_r1"
    assert drone["sources"]["ulg"] == ["raw/drone_2_r1/replayed_r1.ulg"]
    assert drone["sources"]["system_manager"] == []
    assert drone["sources"]["hardware_adapter"] == []
    assert drone["replay"] == {"run_id": "abc", "overrides": {"EKF2_X": 1}}
    assert manifest["ui"]["visible_drone_ids"] == [1, 2, "2_r1"]


def test_second_attach_is_monotonic_r2(tmp_path, monkeypatch):
    orig, replayed = _setup_s(tmp_path, monkeypatch)
    first = attach_replay("S", 2, "abc", orig, replayed, {"EKF2_X": 1})
    assert first["replay_id"] == "2_r1"

    replayed2 = tmp_path / "y_replayed.ulg"
    replayed2.write_bytes(b"second")
    second = attach_replay("S", 2, "def", orig, replayed2, {})
    assert second == {"replay_id": "2_r2", "j": 2}
    assert (tmp_path / "S" / "raw" / "drone_2_r1" / "replayed_r1.ulg").is_file()
    dest2 = tmp_path / "S" / "raw" / "drone_2_r1"  # must not reuse
    assert not (dest2 / "replayed_r2.ulg").exists()
    dest_r2 = tmp_path / "S" / "raw" / "drone_2_r2" / "replayed_r2.ulg"
    assert dest_r2.is_file()
    assert dest_r2.read_bytes() == b"second"

    manifest = load_manifest(tmp_path / "S" / "manifest.json")
    ids = [d["id"] for d in manifest["drones"]]
    assert "2_r1" in ids and "2_r2" in ids
    drone = next(d for d in manifest["drones"] if d["id"] == "2_r2")
    assert drone["kind"] == "replay"
    assert drone["parent_id"] == 2
    assert drone["replay_index"] == 2
    assert drone["label"] == "D2_r2"
    assert drone["sources"]["ulg"] == ["raw/drone_2_r2/replayed_r2.ulg"]
    assert "2_r1" in manifest["ui"]["visible_drone_ids"]
    assert "2_r2" in manifest["ui"]["visible_drone_ids"]
