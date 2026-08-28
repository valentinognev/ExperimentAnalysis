import pytest

from ea.manifest import load_manifest, save_manifest
from ea.store import (
    add_drone,
    create_experiment,
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
