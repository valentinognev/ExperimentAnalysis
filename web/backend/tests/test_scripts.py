from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def test_scripts_scoped():
    start = (ROOT / "start.sh").read_text()
    kill = (ROOT / "killall.sh").read_text()
    attach = (ROOT / "attach.sh").read_text()
    install = (ROOT / "install.sh").read_text()

    assert "6400" in start and "6473" in start
    assert "experiment_analysis" in start
    assert "CHOKIDAR_USEPOLLING" in start
    assert "ObservationBoard" not in kill or "Leaves ObservationBoard" in kill
    assert "killall.sh" in kill
    for bad in ("6173", "3001", "5173"):
        assert f"kill_port {bad}" not in kill
        assert f"lsof -ti:{bad}" not in kill

    assert "experiment_analysis" in attach
    assert ".venv" in install
    assert "npm" in install
