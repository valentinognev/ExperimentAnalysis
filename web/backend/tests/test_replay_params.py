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
