from ea.ingest_files import import_paths
from ea.manifest import load_manifest
from ea.store import create_experiment


def test_mystery_ulg_with_assignment(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    create_experiment("Assign")
    f = tmp_path / "mystery.ulg"
    f.write_bytes(b"ULog")
    result = import_paths("Assign", [str(f)], assignments={"mystery.ulg": 3})
    assert result["ok"] is True
    assert result["needs_id"] == []
    assert "3" in result["drones"]
    assert list((tmp_path / "Assign" / "raw" / "drone_3").glob("mystery.ulg"))


def test_second_import_with_assignment(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    create_experiment("Retry")
    f = tmp_path / "mystery.ulg"
    f.write_bytes(b"ULog")
    first = import_paths("Retry", [str(f)])
    assert first["needs_id"] == ["mystery.ulg"]
    assert not (tmp_path / "Retry" / "raw" / "drone_3").exists()

    second = import_paths("Retry", [str(f)], assignments={"mystery.ulg": 3})
    assert second["ok"] is True
    assert second["needs_id"] == []
    assert list((tmp_path / "Retry" / "raw" / "drone_3").glob("mystery.ulg"))


def test_sim_sm_directory(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    create_experiment("SimSM")
    src = tmp_path / "system_manager" / "logs"
    src.mkdir(parents=True)
    (src / "20260814_system_manager_d2.csv").write_text("local_ts,state\n1,S3")
    result = import_paths("SimSM", [str(src)])
    assert result["ok"] is True
    assert (tmp_path / "SimSM" / "raw" / "drone_2" / "20260814_system_manager_d2.csv").is_file()
    manifest = load_manifest(tmp_path / "SimSM" / "manifest.json")
    drone2 = next(d for d in manifest["drones"] if d["id"] == 2)
    sm_paths = drone2["sources"]["system_manager"]
    assert any("20260814_system_manager_d2.csv" in p for p in sm_paths)


def test_sim_ha_directory(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    create_experiment("SimHA")
    src = tmp_path / "hardware_adapter" / "logs"
    src.mkdir(parents=True)
    (src / "20260814_adapter_diag_d2.log").write_text("diag line\n")
    (src / "20260814_mavlink_d2.txt").write_text("mavlink line\n")
    result = import_paths("SimHA", [str(src)])
    assert result["ok"] is True
    raw = tmp_path / "SimHA" / "raw" / "drone_2"
    assert (raw / "20260814_adapter_diag_d2.log").is_file()
    assert (raw / "20260814_mavlink_d2.txt").is_file()
    manifest = load_manifest(tmp_path / "SimHA" / "manifest.json")
    drone2 = next(d for d in manifest["drones"] if d["id"] == 2)
    ha_paths = drone2["sources"]["hardware_adapter"]
    assert any("adapter_diag" in p for p in ha_paths)
    assert any("mavlink" in p for p in ha_paths)
