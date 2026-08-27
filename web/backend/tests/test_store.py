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
