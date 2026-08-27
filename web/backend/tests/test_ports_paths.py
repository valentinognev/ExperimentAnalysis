import os
from ports import BACKEND_PORT, FRONTEND_PORT, FORBIDDEN_PORTS, BACKEND_HOST
from paths import experiments_dir, repo_root


def test_ports_do_not_collide():
    assert BACKEND_HOST == "127.0.0.1"
    assert BACKEND_PORT == 6400
    assert FRONTEND_PORT == 6473
    assert BACKEND_PORT not in FORBIDDEN_PORTS
    assert FRONTEND_PORT not in FORBIDDEN_PORTS
    assert FORBIDDEN_PORTS == (5000, 6173, 3001, 5173)


def test_experiments_dir_default(tmp_path, monkeypatch):
    monkeypatch.delenv("EA_EXPERIMENTS_DIR", raising=False)
    assert experiments_dir() == repo_root() / "experiments"


def test_experiments_dir_override(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    assert experiments_dir() == tmp_path
