import pytest
from ea.replay.ulog_params import inspect_ulog
from ea.ulog_min import write_min_ulog


class FakeDS:
    def __init__(self, name):
        self.name = name


class FakeULog:
    def __init__(self, params, topics, start, last):
        self.initial_parameters = params
        self.data_list = [FakeDS(n) for n in topics]
        self.start_timestamp = start
        self.last_timestamp = last


def test_inspect_params_and_warning(tmp_path):
    fake = FakeULog(
        {"EKF2_RNG_NOISE": 0.1, "MC_ROLL_P": 6.0},
        ["vehicle_attitude"],
        0,
        2_000_000,
    )
    info = inspect_ulog(tmp_path / "x.ulg", ulog_factory=lambda p: fake)
    assert info["params"] == [
        {"name": "EKF2_RNG_NOISE", "value": 0.1},
        {"name": "MC_ROLL_P", "value": 6.0},
    ]
    assert info["topics"] == ["vehicle_attitude"]
    assert info["duration_s"] == pytest.approx(2.0)
    assert info["warnings"] == [
        "missing EKF2 topics: sensor_combined, vehicle_gps_position"
    ]


def test_no_warning_when_required_present(tmp_path):
    fake = FakeULog({}, ["sensor_combined", "vehicle_gps_position"], 0, 0)
    info = inspect_ulog(tmp_path / "x.ulg", ulog_factory=lambda p: fake)
    assert info["warnings"] == []


def test_corrupt_raises(tmp_path):
    bad = tmp_path / "bad.ulg"
    bad.write_bytes(b"not a ulog")
    with pytest.raises(ValueError):
        inspect_ulog(bad)


def test_inspect_real_min_ulog(tmp_path):
    path = tmp_path / "a.ulg"
    write_min_ulog(
        path,
        {
            "vehicle_local_position": [
                {"timestamp": 0, "x": 0.0, "y": 0.0, "z": 0.0}
            ]
        },
    )
    info = inspect_ulog(path)
    assert "vehicle_local_position" in info["topics"]
