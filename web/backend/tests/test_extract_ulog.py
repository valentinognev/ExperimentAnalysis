from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq

from ea.extract_ulog import ALWAYS, extract_ulog
from ea.ulog_min import write_min_ulog


def test_extract_ulog_to_parquet(tmp_path):
    ulg = tmp_path / "a.ulg"
    dest = tmp_path / "out"
    write_min_ulog(
        ulg,
        {
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
        },
    )

    written = extract_ulog(ulg, dest)

    assert set(written) == {
        "vehicle_status",
        "vehicle_local_position",
        "vehicle_attitude",
        "vehicle_gps_position",
    }
    assert set(ALWAYS) == {
        "vehicle_local_position",
        "vehicle_gps_position",
        "vehicle_attitude",
        "vehicle_status",
        "home_position",
    }

    vs = pq.read_table(dest / "vehicle_status.parquet")
    assert list(vs.column("arming_state").to_pylist()) == [1, 2]
    assert vs.schema.field("timestamp").type == pa.uint64()

    lp = pq.read_table(dest / "vehicle_local_position.parquet")
    assert list(lp.column("x").to_pylist()) == [0.0, 1.0]
    assert lp.schema.field("timestamp").type == pa.uint64()


def test_extract_ulog_gps_fallback_to_global_position(tmp_path):
    ulg = tmp_path / "sitl.ulg"
    dest = tmp_path / "out"
    write_min_ulog(
        ulg,
        {
            "vehicle_status": [
                {"timestamp": 1000, "arming_state": 1},
            ],
            "vehicle_local_position": [
                {"timestamp": 1000, "x": 0.0, "y": 0.0, "z": 0.0},
            ],
            "vehicle_attitude": [
                {"timestamp": 1000, "q[0]": 1.0, "q[1]": 0.0, "q[2]": 0.0, "q[3]": 0.0},
            ],
            "vehicle_global_position": [
                {"timestamp": 5000, "lat": 320800000, "lon": 347800000, "alt": 50000},
            ],
        },
    )

    written = extract_ulog(ulg, dest)

    assert "vehicle_global_position" in written
    assert "vehicle_gps_position" not in written
    assert (dest / "vehicle_global_position.parquet").is_file()
    assert not (dest / "vehicle_gps_position.parquet").exists()
