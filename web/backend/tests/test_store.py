import pytest

from ea.manifest import load_manifest, save_manifest
from ea.store import create_experiment, list_experiments, open_experiment


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
