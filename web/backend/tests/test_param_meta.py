import json
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
    assert json.loads(dest.read_text(encoding="utf-8")) == data
    assert dest.read_text(encoding="utf-8").endswith("}\n")
    assert data == parse_param_meta(FIXTURE)


def test_empty_bitmask_falls_through_to_values():
    meta = parse_param_meta(FIXTURE)
    assert meta["EMPTY_BITMASK_WITH_VALUES"] == {
        "kind": "enum",
        "options": [{"value": 0, "label": "Fallback enum"}],
    }


def test_empty_values_falls_through_to_boolean():
    meta = parse_param_meta(FIXTURE)
    assert meta["EMPTY_VALUES_BOOLEAN"] == {"kind": "boolean"}


def test_empty_bitmask_and_values_omitted():
    meta = parse_param_meta(FIXTURE)
    assert "EMPTY_BOTH_OMIT" not in meta
