from pyulog import ULog

from ea.ulog_min import write_min_ulog


def test_pyulog_reads_written_file(tmp_path):
    p = tmp_path / "a.ulg"
    write_min_ulog(p, {
        "vehicle_status": [
            {"timestamp": 1000, "arming_state": 1},
            {"timestamp": 5000, "arming_state": 2},
        ],
        "vehicle_local_position": [
            {"timestamp": 1000, "x": 0.0, "y": 0.0, "z": 0.0},
            {"timestamp": 5000, "x": 1.0, "y": 2.0, "z": -3.0},
        ],
        "vehicle_attitude": [
            {"timestamp": 1000, "q[0]": 1.0, "q[1]": 0.0, "q[2]": 0.0, "q[3]": 0.0},
        ],
        "vehicle_gps_position": [
            {"timestamp": 5000, "lat": 320800000, "lon": 347800000, "alt": 50000},
        ],
    })
    ulog = ULog(str(p))
    vs = ulog.get_dataset("vehicle_status")
    assert list(vs.data["arming_state"]) == [1, 2]
