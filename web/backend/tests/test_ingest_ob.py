import json

from ea.ingest_files import import_paths
from ea.manifest import load_manifest, save_manifest
from ea.pose import pose_at
from ea.rebuild import rebuild
from ea.store import create_experiment


def test_obs_csv_is_swarm_level(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    create_experiment("SwarmObs")
    src = tmp_path / "incoming"
    src.mkdir()
    (src / "Group3RLcat2_log_1.ulg").write_bytes(b"ULog")
    (src / "obs_20261026_100000z.csv").write_text("recv_time_s\n", encoding="utf-8")
    (src / "obs_20261026_090000z.csv").write_text("recv_time_s\n", encoding="utf-8")

    result = import_paths("SwarmObs", [str(src)], drone_id=2)

    exp = tmp_path / "SwarmObs"
    assert result["needs_id"] == []
    assert (exp / "raw" / "observation" / "obs_20261026_100000z.csv").is_file()
    assert (exp / "raw" / "observation" / "obs_20261026_090000z.csv").is_file()
    assert not list((exp / "raw" / "drone_2").glob("obs_*.csv"))
    manifest = load_manifest(exp / "manifest.json")
    assert manifest["observation"] == ["raw/observation/obs_20261026_100000z.csv"]


def test_single_file_import_becomes_active(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    create_experiment("OneObs")
    src = tmp_path / "obs_20261026_090000z.csv"
    src.write_text("recv_time_s\n", encoding="utf-8")

    import_paths("OneObs", [str(src)])

    manifest = load_manifest(tmp_path / "OneObs" / "manifest.json")
    assert manifest["observation"] == ["raw/observation/obs_20261026_090000z.csv"]


def test_rebuild_extracts_observation(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    created = create_experiment("ObsRebuild")
    src = tmp_path / "obs_20261026_100000z.csv"
    src.write_text(
        "recv_time_s,kind,gs_goto_speed\n1000,gs_control,1\n",
        encoding="utf-8",
    )
    import_paths(created["slug"], [str(src)])

    result = rebuild(created["slug"])

    assert result["ok"] is True
    assert (created["path"] / "derived" / "observation" / "command.parquet").is_file()


def test_header_only_obs_imports_and_rebuild_skips(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    created = create_experiment("ObsHeader")
    src = tmp_path / "obs_header.csv"
    src.write_text("recv_time_s,kind,gs_goto_speed\n", encoding="utf-8")
    import_paths(created["slug"], [str(src)])

    exp = created["path"]
    assert (exp / "raw" / "observation" / "obs_header.csv").is_file()
    result = rebuild(created["slug"])
    assert result["ok"] is True
    assert not (exp / "derived" / "observation" / "command.parquet").exists()


def test_rebuild_uses_manifest_main_drone_id(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    created = create_experiment("ObsMain")
    manifest_path = created["path"] / "manifest.json"
    manifest = load_manifest(manifest_path)
    manifest["sync"]["main_drone_id"] = 4
    save_manifest(manifest_path, manifest)

    src = tmp_path / "obs_20261026_100000z.csv"
    src.write_text(
        "recv_time_s,kind,drone_id,armed,gs_goto_speed\n"
        "1000,drone_update,2,1,1\n"
        "1005,drone_update,4,1,\n",
        encoding="utf-8",
    )
    import_paths(created["slug"], [str(src)])
    rebuild(created["slug"])

    anchor = json.loads(
        (created["path"] / "derived" / "observation" / "anchor.json").read_text()
    )
    assert anchor["arm_recv_s"] == 1005.0


def test_rebuild_anchors_on_string_main_drone_id(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    created = create_experiment("ObsMainStr")
    manifest_path = created["path"] / "manifest.json"
    manifest = load_manifest(manifest_path)
    manifest["sync"]["main_drone_id"] = "4"
    save_manifest(manifest_path, manifest)

    src = tmp_path / "obs_20261026_100000z.csv"
    src.write_text(
        "recv_time_s,kind,drone_id,armed,gs_goto_speed\n"
        "1000,drone_update,2,1,1\n"
        "1005,drone_update,4,1,\n",
        encoding="utf-8",
    )
    import_paths(created["slug"], [str(src)])
    rebuild(created["slug"])

    anchor = json.loads(
        (created["path"] / "derived" / "observation" / "anchor.json").read_text()
    )
    assert anchor["arm_recv_s"] == 1005.0


def test_rebuild_drops_stale_observation_when_active_log_is_header_only(
    tmp_path, monkeypatch
):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    created = create_experiment("ObsStale")
    src = tmp_path / "obs_20261026_100000z.csv"
    src.write_text(
        "recv_time_s,kind,gs_goto_speed\n1000,gs_control,1\n",
        encoding="utf-8",
    )
    import_paths(created["slug"], [str(src)])
    rebuild(created["slug"])

    exp = created["path"]
    derived = exp / "derived" / "observation"
    assert (derived / "command.parquet").is_file()
    assert (derived / "anchor.json").is_file()

    header_name = "obs_20261026_110000z.csv"
    (exp / "raw" / "observation" / header_name).write_text(
        "recv_time_s,kind,gs_goto_speed\n",
        encoding="utf-8",
    )
    manifest_path = exp / "manifest.json"
    manifest = load_manifest(manifest_path)
    manifest["observation"] = [f"raw/observation/{header_name}"]
    save_manifest(manifest_path, manifest)

    rebuild(created["slug"])

    assert not (derived / "command.parquet").exists()
    assert not (derived / "anchor.json").exists()
    assert pose_at(exp, 0.0)["mission"] is None


def test_rebuild_drops_stale_observation_when_active_log_is_missing(
    tmp_path, monkeypatch
):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    created = create_experiment("ObsMissing")
    src = tmp_path / "obs_20261026_100000z.csv"
    src.write_text(
        "recv_time_s,kind,gs_goto_speed\n1000,gs_control,1\n",
        encoding="utf-8",
    )
    import_paths(created["slug"], [str(src)])
    rebuild(created["slug"])

    exp = created["path"]
    derived = exp / "derived" / "observation"
    assert (derived / "command.parquet").is_file()
    assert (derived / "anchor.json").is_file()

    manifest_path = exp / "manifest.json"
    manifest = load_manifest(manifest_path)
    manifest["observation"] = ["raw/observation/obs_20261026_gone.csv"]
    save_manifest(manifest_path, manifest)

    rebuild(created["slug"])

    assert not (derived / "command.parquet").exists()
    assert not (derived / "anchor.json").exists()
    assert pose_at(exp, 0.0)["mission"] is None
