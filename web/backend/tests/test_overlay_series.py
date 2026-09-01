from ea.replay.overlay_series import overlay_series
from ea.ulog_min import write_min_ulog


def test_attitude_and_local(tmp_path):
    o = tmp_path / "o.ulg"
    r = tmp_path / "r.ulg"
    rec_o = {
        "vehicle_local_position": [{"timestamp": 1_000_000, "x": 1.0, "y": 0.0, "z": 0.0}],
        "vehicle_attitude": [
            {"timestamp": 1_000_000, "q[0]": 1.0, "q[1]": 0.0, "q[2]": 0.0, "q[3]": 0.0}
        ],
    }
    rec_r = {
        "vehicle_local_position": [{"timestamp": 1_000_000, "x": 2.0, "y": 0.0, "z": 0.0}],
        "vehicle_attitude": [
            {"timestamp": 1_000_000, "q[0]": 0.9, "q[1]": 0.0, "q[2]": 0.0, "q[3]": 0.0}
        ],
    }
    write_min_ulog(o, rec_o)
    write_min_ulog(r, rec_r)
    data = overlay_series(o, r)
    assert "estimator_innovations" not in data
    assert data["vehicle_local_position"]["x"]["original"] == [1.0]
    assert data["vehicle_local_position"]["x"]["replayed"] == [2.0]
    assert data["vehicle_local_position"]["x"]["t_original"] == [1.0]


def test_innovations_included_when_present(tmp_path):
    o = tmp_path / "o.ulg"
    r = tmp_path / "r.ulg"
    inn = {"estimator_innovations": [{"timestamp": 0, "x": 0.5}]}
    loc = {"vehicle_local_position": [{"timestamp": 0, "x": 0.0, "y": 0.0, "z": 0.0}]}
    att = {
        "vehicle_attitude": [
            {"timestamp": 0, "q[0]": 1.0, "q[1]": 0.0, "q[2]": 0.0, "q[3]": 0.0}
        ]
    }
    write_min_ulog(o, {**loc, **att})
    write_min_ulog(r, {**loc, **att, **inn})
    data = overlay_series(o, r)
    assert "estimator_innovations" in data
    assert data["estimator_innovations"]["x"]["replayed"] == [0.5]
    assert data["estimator_innovations"]["x"]["original"] == []
