from pathlib import Path

from app import _sitl_log_root
from ea.replay.paths import (
    container_px4_root,
    host_px4_root,
    host_replay_params_path,
)

_HOST = Path("/home/valentin/Projects/GambitonBiut/docker_firm/PX4-Autopilot")


def test_host_px4_root_is_gambiton_tree_not_container():
    assert host_px4_root() == _HOST
    assert host_px4_root() != Path(container_px4_root())
    assert str(host_px4_root()) != container_px4_root()


def test_host_replay_params_path_is_under_host_tree():
    assert host_replay_params_path() == (
        _HOST / "build/px4_sitl_default_replay/rootfs/replay_params.txt"
    )
    assert str(host_replay_params_path()).startswith(str(_HOST))


def test_sitl_log_root_is_host_rootfs_not_microsd():
    root = _sitl_log_root()
    assert root == _HOST / "build/px4_sitl_default_replay/rootfs"
    assert "fs/microsd" not in str(root)
    assert str(root).endswith("rootfs")
