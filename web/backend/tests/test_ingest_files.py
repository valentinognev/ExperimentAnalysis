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


def test_import_paths_drone_id_copies_mystery_and_empty_needs_id(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    create_experiment("Mystery")
    f = tmp_path / "mystery.ulg"
    f.write_bytes(b"ULog")
    result = import_paths("Mystery", [str(f)], drone_id=3)
    assert result["needs_id"] == []
    assert (tmp_path / "Mystery" / "raw" / "drone_3" / "mystery.ulg").is_file()
