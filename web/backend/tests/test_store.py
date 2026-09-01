import pytest

from ea.manifest import load_manifest, save_manifest
from ea.store import (
    add_drone,
    create_experiment,
    delete_replay_drone,
    list_experiments,
    open_experiment,
    set_drone_count,
)


def test_create_and_list(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    created = create_experiment("Baseball")
    assert created["slug"] == "Baseball"
    assert (tmp_path / "Baseball" / "manifest.json").is_file()
    assert (tmp_path / "Baseball" / "raw").is_dir()
    assert (tmp_path / "Baseball" / "derived").is_dir()
    listed = list_experiments()
    assert listed[0]["slug"] == "Baseball"
    assert listed[0]["drone_ids"] == []
    opened = open_experiment("Baseball")
    assert opened["manifest"]["name"] == "Baseball"


def test_create_experiment_duplicate_raises(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    create_experiment("Alpha")
    with pytest.raises(FileExistsError, match="experiment already exists: Alpha"):
        create_experiment("Alpha")


def test_open_experiment_missing_raises(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    with pytest.raises(FileNotFoundError, match="experiment not found: no-such-slug"):
        open_experiment("no-such-slug")


def test_list_experiments_missing_ulg(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    create_experiment("Drones")
    manifest_path = tmp_path / "Drones" / "manifest.json"
    manifest = load_manifest(manifest_path)
    manifest["drones"] = [
        {"id": 1, "sources": {"ulg": []}},
        {"id": 2, "sources": {"ulg": ["raw/drone_2/a.ulg"]}},
        {"id": 3, "sources": {}},
    ]
    save_manifest(manifest_path, manifest)

    listed = list_experiments()
    assert listed[0]["drone_ids"] == [1, 2, 3]
    assert listed[0]["missing"] == [1, 3]


def test_create_experiment_slugify_preserves_name(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    created = create_experiment("flight 01")
    assert created["slug"] == "flight_01"
    assert (tmp_path / "flight_01" / "manifest.json").is_file()

    listed = list_experiments()
    assert listed[0]["slug"] == "flight_01"
    assert listed[0]["name"] == "flight 01"


def test_add_drone_sparse_ids_seeds_and_no_duplicate(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    create_experiment("Add")
    add_drone("Add", 2)
    add_drone("Add", 4)
    add_drone("Add", 3)
    opened = open_experiment("Add")
    ids = [d["id"] for d in opened["manifest"]["drones"]]
    assert ids == [2, 4, 3]
    by_id = {d["id"]: d for d in opened["manifest"]["drones"]}
    assert by_id[2]["ssh"]["host"] == "192.168.31.30"
    assert by_id[4]["ssh"]["host"] == "192.168.31.152"
    assert by_id[3]["ssh"]["host"] == ""
    again = add_drone("Add", 2)
    assert [d["id"] for d in again["manifest"]["drones"]] == [2, 4, 3]
    assert again["slug"] == "Add"
    assert again["path"] == tmp_path / "Add"


def test_add_drone_missing_experiment_raises(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    with pytest.raises(FileNotFoundError):
        add_drone("nope", 2)


def test_add_drone_id_less_than_one_raises(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    create_experiment("Bad")
    with pytest.raises(ValueError):
        add_drone("Bad", 0)


def test_set_drone_count_grows_then_trims_from_the_end(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    create_experiment("Trim")
    set_drone_count("Trim", 4)
    root = tmp_path / "Trim"
    (root / "raw" / "drone_4").mkdir(parents=True)
    (root / "raw" / "drone_4" / "keep.ulg").write_bytes(b"ULog")
    (root / "derived" / "drone_4").mkdir(parents=True)
    (root / "derived" / "drone_4" / "x.parquet").write_bytes(b"p")
    (root / "derived" / "ha" / "drone_4").mkdir(parents=True)
    (root / "raw" / "drone_2").mkdir(parents=True)
    (root / "raw" / "drone_2" / "a.ulg").write_bytes(b"ULog")
    manifest = load_manifest(root / "manifest.json")
    manifest["ui"]["visible_drone_ids"] = [1, 2, 3, 4]
    save_manifest(root / "manifest.json", manifest)

    trimmed = set_drone_count("Trim", 2)
    ids = [d["id"] for d in trimmed["manifest"]["drones"]]
    assert sorted(ids) == [1, 2]
    assert 3 not in ids
    assert 4 not in ids
    assert trimmed["manifest"]["ui"]["visible_drone_ids"] == [1, 2]
    assert not (root / "raw" / "drone_4").exists()
    assert not (root / "derived" / "drone_4").exists()
    assert not (root / "derived" / "ha" / "drone_4").exists()
    assert (root / "raw" / "drone_2" / "a.ulg").is_file()

    grown = set_drone_count("Trim", 4)
    assert sorted(d["id"] for d in grown["manifest"]["drones"]) == [1, 2, 3, 4]


def test_set_drone_count_out_of_range_raises(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    create_experiment("Range")
    with pytest.raises(ValueError):
        set_drone_count("Range", 0)
    with pytest.raises(ValueError):
        set_drone_count("Range", 10)


def test_set_drone_count_drops_replay_children(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    create_experiment("TrimR")
    set_drone_count("TrimR", 3)
    manifest_path = tmp_path / "TrimR" / "manifest.json"
    manifest = load_manifest(manifest_path)
    manifest["drones"].append({
        "id": "2_r1",
        "kind": "replay",
        "parent_id": 2,
        "replay_index": 1,
        "label": "D2_r1",
        "sources": {"ulg": ["raw/drone_2_r1/replayed_r1.ulg"]},
    })
    manifest["drones"].append({
        "id": "3_r1",
        "kind": "replay",
        "parent_id": 3,
        "replay_index": 1,
        "label": "D3_r1",
        "sources": {"ulg": []},
    })
    save_manifest(manifest_path, manifest)
    (tmp_path / "TrimR" / "raw" / "drone_3_r1").mkdir(parents=True)
    (tmp_path / "TrimR" / "raw" / "drone_2_r1").mkdir(parents=True)
    trimmed = set_drone_count("TrimR", 2)
    ids = [d["id"] for d in trimmed["manifest"]["drones"]]
    assert 3 not in ids and "3_r1" not in ids
    assert "2_r1" in ids and 2 in ids
    assert not (tmp_path / "TrimR" / "raw" / "drone_3_r1").exists()
    assert (tmp_path / "TrimR" / "raw" / "drone_2_r1").is_dir()


def test_delete_replay_drone_removes_row(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    create_experiment("DelR")
    set_drone_count("DelR", 2)
    manifest_path = tmp_path / "DelR" / "manifest.json"
    manifest = load_manifest(manifest_path)
    manifest["drones"].append({
        "id": "2_r1",
        "kind": "replay",
        "parent_id": 2,
        "replay_index": 1,
        "label": "D2_r1",
        "sources": {"ulg": []},
    })
    manifest["ui"]["visible_drone_ids"] = [2, "2_r1"]
    save_manifest(manifest_path, manifest)
    (tmp_path / "DelR" / "raw" / "drone_2_r1").mkdir(parents=True)
    result = delete_replay_drone("DelR", "2_r1")
    ids = [d["id"] for d in result["manifest"]["drones"]]
    assert "2_r1" not in ids
    assert 2 in ids
    assert "2_r1" not in result["manifest"]["ui"]["visible_drone_ids"]
    assert not (tmp_path / "DelR" / "raw" / "drone_2_r1").exists()


def test_delete_physical_raises(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    create_experiment("DelP")
    set_drone_count("DelP", 2)
    with pytest.raises(ValueError, match="replay"):
        delete_replay_drone("DelP", 2)


def test_delete_replay_drone_strips_avatars_and_plots(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    create_experiment("DelUI")
    set_drone_count("DelUI", 2)
    manifest_path = tmp_path / "DelUI" / "manifest.json"
    manifest = load_manifest(manifest_path)
    manifest["drones"].append({
        "id": "2_r1",
        "kind": "replay",
        "parent_id": 2,
        "replay_index": 1,
        "label": "D2_r1",
        "sources": {"ulg": []},
    })
    manifest["ui"]["avatars"] = {
        "2": {"ekf_ned": True},
        "2_r1": {"ekf_ned": True},
    }
    manifest["ui"]["plots"] = [
        {"channels": ["2.ulog.vehicle_local_position.x"]},
        {"channels": ["2_r1.ulog.vehicle_local_position.x"]},
        {"channels": ["2.ulog.vehicle_attitude.q"]},
    ]
    save_manifest(manifest_path, manifest)
    result = delete_replay_drone("DelUI", "2_r1")
    ui = result["manifest"]["ui"]
    assert "2_r1" not in ui["avatars"]
    assert "2" in ui["avatars"]
    assert ui["plots"] == [
        {"channels": ["2.ulog.vehicle_local_position.x"]},
        {"channels": ["2.ulog.vehicle_attitude.q"]},
    ]
