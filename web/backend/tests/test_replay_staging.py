from pathlib import Path
from ea.replay.work_staging import inspect_and_stage, container_ulg_path
from ea.ulog_min import write_min_ulog


def test_container_path_uses_experiment_mount():
    assert container_ulg_path("Exp", "abc") == (
        "/home/valentin/ExperimentAnalysis/experiments/Exp/replay/work/abc/input.ulg"
    )


def test_stage_after_ok(tmp_path):
    src = tmp_path / "src.ulg"
    write_min_ulog(src, {"vehicle_local_position": [{"timestamp": 0, "x": 0.0, "y": 0.0, "z": 0.0}]})
    work = tmp_path / "work"
    work.mkdir()
    info = inspect_and_stage(src, work, "Exp")
    assert len(info["run_id"]) == 12
    assert Path(info["host_ulg"]).name == "input.ulg"
    assert info["container_ulg"] == container_ulg_path("Exp", info["run_id"])


def test_bad_file_creates_no_work(tmp_path):
    src = tmp_path / "bad.ulg"
    src.write_bytes(b"nope")
    work = tmp_path / "work"
    work.mkdir()
    import pytest
    with pytest.raises(ValueError):
        inspect_and_stage(src, work, "Exp")
    assert list(work.iterdir()) == []
