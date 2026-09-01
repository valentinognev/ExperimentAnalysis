from ea.replay.paths import DOCKER_CONTAINER, container_px4_root, container_replay_root

__all__ = ["DOCKER_CONTAINER", "build_replay_argv"]


def build_replay_argv(container_ulg: str) -> list[str]:
    prefix = container_replay_root().rstrip("/") + "/"
    if not container_ulg.startswith(prefix):
        raise ValueError("replay path must be under /home/valentin/ExperimentAnalysis")
    cmd = [
        "docker",
        "exec",
        "-w",
        container_px4_root(),
        "-e",
        "replay_mode=ekf2",
        "-e",
        f"replay={container_ulg}",
        DOCKER_CONTAINER,
        "make",
        "px4_sitl",
        "none",
    ]
    joined = " ".join(cmd)
    if "matek" in joined.lower():
        raise RuntimeError("matek target forbidden")
    return cmd
