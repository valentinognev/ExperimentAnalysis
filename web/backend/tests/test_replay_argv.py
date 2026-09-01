import pytest

from ea.replay.replay_argv import DOCKER_CONTAINER, build_replay_argv


def test_argv_ekf2_sitl_none():
    ulg = "/home/valentin/ExperimentAnalysis/experiments/x/replay/work/abc/input.ulg"
    cmd = build_replay_argv(ulg)
    assert cmd == [
        "docker",
        "exec",
        "-w",
        "/home/valentin/PX4-Autopilot",
        "-e",
        "replay_mode=ekf2",
        "-e",
        f"replay={ulg}",
        DOCKER_CONTAINER,
        "make",
        "px4_sitl",
        "none",
    ]
    joined = " ".join(cmd)
    assert "matek" not in joined.lower()
    assert "matek_h743-slim_default" not in joined


def test_rejects_ulg_outside_mount():
    with pytest.raises(ValueError):
        build_replay_argv("/tmp/log.ulg")


def test_rejects_matek_in_path():
    with pytest.raises(RuntimeError, match="matek"):
        build_replay_argv(
            "/home/valentin/ExperimentAnalysis/experiments/x/replay/work/matek_h743-slim_default/input.ulg"
        )
