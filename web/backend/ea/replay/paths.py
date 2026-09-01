from pathlib import Path

_HOST_PX4 = Path("/home/valentin/Projects/GambitonBiut/docker_firm/PX4-Autopilot")

DOCKER_CONTAINER = "dockerfiles_firm-px4-noetic-firm-1"


def host_px4_root() -> Path:
    return _HOST_PX4


def container_px4_root() -> str:
    return "/home/valentin/PX4-Autopilot"


def container_replay_root() -> str:
    return "/home/valentin/ExperimentAnalysis"


def host_replay_params_path() -> Path:
    return host_px4_root() / "build/px4_sitl_default_replay/rootfs/replay_params.txt"
