from pathlib import Path
import subprocess

from ea.replay.paths import DOCKER_CONTAINER, container_px4_root


def _payload(overrides: dict[str, float | int | str]) -> bytes:
    if not overrides:
        return b""
    return "".join(f"{name} {overrides[name]}\n" for name in sorted(overrides)).encode(
        "utf-8"
    )


def _container_replay_params() -> str:
    return f"{container_px4_root()}/build/px4_sitl_default_replay/rootfs/replay_params.txt"


def _write_via_docker(content: bytes) -> None:
    dest = _container_replay_params()
    proc = subprocess.run(
        ["docker", "exec", "-i", DOCKER_CONTAINER, "tee", dest],
        input=content,
        capture_output=True,
    )
    if proc.returncode != 0:
        err = proc.stderr or proc.stdout or b""
        if isinstance(err, bytes):
            err = err.decode("utf-8", "replace")
        raise RuntimeError(f"could not write replay_params.txt: {err}")


def write_replay_params(path: Path, overrides: dict[str, float | int | str]) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    content = _payload(overrides)
    try:
        path.write_bytes(content)
    except PermissionError:
        _write_via_docker(content)
