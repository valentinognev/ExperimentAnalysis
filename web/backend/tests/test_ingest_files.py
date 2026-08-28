from pathlib import Path

from fastapi.testclient import TestClient

from app import app
from ea.store import create_experiment
from ea.ingest_files import import_paths


def test_import_three_named_ulogs(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    create_experiment("Baseball")
    src = tmp_path / "incoming"
    src.mkdir()
    for n in (2, 3, 4):
        (src / f"Group3RLcat{n}_log_1.ulg").write_bytes(b"ULog")
    result = import_paths("Baseball", [str(src)])
    assert result["ok"] is True
    assert set(result["drones"]) >= {"2", "3", "4"} or set(int(k) for k in result["drones"]) >= {2, 3, 4}
    root = tmp_path / "Baseball"
    assert (root / "raw" / "drone_2").exists()
    assert list((root / "raw" / "drone_3").glob("*.ulg"))
    assert list((root / "raw" / "drone_4").glob("*.ulg"))


def test_needs_id(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    create_experiment("X")
    f = tmp_path / "mystery.ulg"
    f.write_bytes(b"ULog")
    result = import_paths("X", [str(f)])
    assert result["needs_id"]
    assert not (tmp_path / "X" / "raw" / "drone_1").exists()


def test_post_import_api(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    c = TestClient(app)
    c.post("/api/experiments", json={"name": "ApiImport"})
    src = tmp_path / "incoming"
    src.mkdir()
    (src / "Group3RLcat2_log_1.ulg").write_bytes(b"ULog")
    r = c.post("/api/experiments/ApiImport/import", json={"paths": [str(src)]})
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert int(list(body["drones"].keys())[0]) == 2
    assert (tmp_path / "ApiImport" / "raw" / "drone_2").exists()


def test_import_paths_drone_id_copies_only_that_drone(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    create_experiment("PerDrone")
    src = tmp_path / "incoming"
    src.mkdir()
    for n in (2, 3, 4):
        (src / f"Group3RLcat{n}_log_1.ulg").write_bytes(b"ULog")
    result = import_paths("PerDrone", [str(src)], drone_id=2)
    assert result["ok"] is True
    root = tmp_path / "PerDrone"
    assert list((root / "raw" / "drone_2").glob("Group3RLcat2_*.ulg"))
    assert not (root / "raw" / "drone_3").exists()
    assert not (root / "raw" / "drone_4").exists()
    assert result["needs_id"] == []


def test_import_paths_records_ulg_origin(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    create_experiment("Origin")
    src = tmp_path / "incoming" / "Group3RLcat2_log_1.ulg"
    src.parent.mkdir()
    src.write_bytes(b"ULog")

    import_paths("Origin", [str(src)], drone_id=2)

    from ea.manifest import load_manifest

    manifest = load_manifest(tmp_path / "Origin" / "manifest.json")
    drone = next(d for d in manifest["drones"] if d["id"] == 2)
    assert drone["sources"]["ulg_origin"] == str(src.resolve())


def test_import_paths_drone_id_copies_mystery_and_empty_needs_id(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    create_experiment("Mystery")
    f = tmp_path / "mystery.ulg"
    f.write_bytes(b"ULog")
    result = import_paths("Mystery", [str(f)], drone_id=3)
    assert result["needs_id"] == []
    assert (tmp_path / "Mystery" / "raw" / "drone_3" / "mystery.ulg").is_file()


def test_directory_of_many_sm_csv_needs_pick_does_not_copy_them(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    create_experiment("ManySM")
    src = tmp_path / "logs"
    src.mkdir()
    names = [
        "2026-07-19_22-33-25_system_manager.csv",
        "2026-08-03_21-54-03_system_manager.csv",
        "2026-08-25_17-00-00_system_manager.csv",
    ]
    for name in names:
        (src / name).write_text("local_ts,state\n1,S3")
    ulg = src / "Group3RLcat2_log_41_2026-8-25-17-05-30.ulg"
    ulg.write_bytes(b"ULog")

    result = import_paths("ManySM", [str(src)], drone_id=2)

    raw = tmp_path / "ManySM" / "raw" / "drone_2"
    assert result["ok"] is True
    assert list(raw.glob("*.ulg"))
    assert list(raw.glob("*.csv")) == []
    pick = result["needs_pick"]
    assert {p["name"] for p in pick} == set(names)
    assert all(p["kind"] == "sm" for p in pick)
    assert all(Path(p["path"]).is_file() for p in pick)

    chosen = next(p for p in pick if p["name"] == "2026-08-25_17-00-00_system_manager.csv")
    second = import_paths("ManySM", [chosen["path"]], drone_id=2)
    assert second.get("needs_pick") in (None, [])
    assert (raw / chosen["name"]).is_file()
    from ea.manifest import load_manifest

    manifest = load_manifest(tmp_path / "ManySM" / "manifest.json")
    drone = next(d for d in manifest["drones"] if d["id"] == 2)
    assert drone["sources"]["system_manager"] == [
        f"raw/drone_2/{chosen['name']}",
    ]


def test_import_selected_sm_replaces_sources_not_all_raw(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    create_experiment("PickOne")
    raw = tmp_path / "PickOne" / "raw" / "drone_2"
    raw.mkdir(parents=True)
    (raw / "2026-07-19_22-33-25_system_manager.csv").write_text("local_ts,state\n1,S3")
    src = tmp_path / "2026-08-25_17-00-00_system_manager.csv"
    src.write_text("local_ts,state\n1,S3")

    from ea.manifest import load_manifest, save_manifest

    manifest_path = tmp_path / "PickOne" / "manifest.json"
    manifest = load_manifest(manifest_path)
    manifest["drones"] = [
        {
            "id": 2,
            "label": "D2",
            "sources": {
                "ulg": [],
                "system_manager": ["raw/drone_2/2026-07-19_22-33-25_system_manager.csv"],
                "hardware_adapter": [],
            },
        }
    ]
    save_manifest(manifest_path, manifest)

    import_paths("PickOne", [str(src)], drone_id=2)

    manifest = load_manifest(manifest_path)
    drone = next(d for d in manifest["drones"] if d["id"] == 2)
    assert drone["sources"]["system_manager"] == [
        "raw/drone_2/2026-08-25_17-00-00_system_manager.csv",
    ]
    assert (raw / "2026-07-19_22-33-25_system_manager.csv").is_file()


def test_directory_of_many_sm_defers_ha_too(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    create_experiment("ManySmHa")
    src = tmp_path / "logs"
    src.mkdir()
    (src / "2026-07-19_22-33-25_system_manager.csv").write_text("local_ts,state\n1,S3")
    (src / "2026-08-25_17-00-00_system_manager.csv").write_text("local_ts,state\n1,S3")
    (src / "2026-08-25_17-06-00_adapter_diag.log").write_text("diag\n")

    result = import_paths("ManySmHa", [str(src)], drone_id=2)
    raw = tmp_path / "ManySmHa" / "raw" / "drone_2"
    assert not raw.exists() or list(raw.iterdir()) == []
    names = {p["name"] for p in result["needs_pick"]}
    assert "2026-08-25_17-00-00_system_manager.csv" in names
    assert "2026-08-25_17-06-00_adapter_diag.log" in names
