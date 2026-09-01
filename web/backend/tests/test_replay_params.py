import subprocess
import types

import ea.replay.replay_params as replay_params
from ea.replay.paths import DOCKER_CONTAINER, container_px4_root
from ea.replay.replay_params import write_replay_params


def test_empty_overrides_zero_byte(tmp_path):
    p = tmp_path / "rootfs" / "replay_params.txt"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text("EKF2_RNG_NOISE 0.1\n")
    write_replay_params(p, {})
    assert p.is_file()
    assert p.read_bytes() == b""


def test_overrides_name_space_value(tmp_path):
    p = tmp_path / "replay_params.txt"
    write_replay_params(p, {"EKF2_RNG_NOISE": 0.1, "EKF2_GPS_P_NOISE": 0.5})
    assert p.read_text() == "EKF2_GPS_P_NOISE 0.5\nEKF2_RNG_NOISE 0.1\n"


def test_permission_denied_writes_via_docker(tmp_path, monkeypatch):
    p = tmp_path / "replay_params.txt"
    p.write_text("OLD\n")
    p.chmod(0o444)
    seen = []

    def fake_run(argv, **kwargs):
        seen.append({"argv": list(argv), "input": kwargs.get("input")})
        return subprocess.CompletedProcess(argv, 0, b"", b"")

    monkeypatch.setattr(
        replay_params,
        "subprocess",
        types.SimpleNamespace(run=fake_run),
        raising=False,
    )
    write_replay_params(p, {"EKF2_A": 1})
    assert seen
    argv = seen[0]["argv"]
    assert argv[:3] == ["docker", "exec", "-i"]
    assert DOCKER_CONTAINER in argv
    dest = f"{container_px4_root()}/build/px4_sitl_default_replay/rootfs/replay_params.txt"
    assert dest in argv
    assert seen[0]["input"] == b"EKF2_A 1\n"
