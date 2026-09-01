from pathlib import Path

from ea.replay.param_meta import parse_param_meta, write_param_meta_json

FIXTURE = Path(__file__).parent / "fixtures" / "param_meta_sample.xml"


def test_parse_enum_bitmask_boolean_and_omit_plain():
    meta = parse_param_meta(FIXTURE)
    assert meta["EKF2_HGT_REF"] == {
        "kind": "enum",
        "options": [
            {"value": 0, "label": "Barometric pressure"},
            {"value": 1, "label": "GPS"},
        ],
    }
    assert meta["EKF2_GPS_CTRL"] == {
        "kind": "bitmask",
        "bits": [
            {"index": 0, "label": "Lon/lat"},
            {"index": 1, "label": "Altitude"},
        ],
    }
    assert meta["EKF2_BARO_CTRL"] == {"kind": "boolean"}
    assert "EKF2_RNG_NOISE" not in meta


def test_bitmask_wins_over_values_and_boolean():
    meta = parse_param_meta(FIXTURE)
    assert meta["BOTH_MASK"] == {
        "kind": "bitmask",
        "bits": [{"index": 2, "label": "Win"}],
    }


def test_write_json_roundtrip(tmp_path):
    dest = tmp_path / "paramMeta.json"
    data = write_param_meta_json(FIXTURE, dest)
    assert dest.is_file()
    assert data == parse_param_meta(FIXTURE)
