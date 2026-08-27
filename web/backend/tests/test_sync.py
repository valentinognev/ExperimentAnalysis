import json
from pathlib import Path

from ea.sync import t_sm, t_ulog, write_sync


def test_t_ulog_two_drones_arm_at_t_zero():
    assert t_ulog(1000, 1000, 500) == 0
    assert t_ulog(9000, 9000, 8000) == 0


def test_t_ulog_missing_arm_uses_first_sample():
    first_us = 5000
    assert t_ulog(first_us, None, first_us) == 0
    assert t_ulog(6500, None, first_us) == (6500 - first_us) / 1e6


def test_t_sm_uses_local_ts_not_timestamp():
    arm_local = 100.0
    local_ts = 105.0
    assert t_sm(local_ts, arm_local, 50.0) == 5.0


def test_t_sm_missing_arm_uses_first_local():
    first_local = 50.0
    assert t_sm(first_local, None, first_local) == 0
    assert t_sm(55.0, None, first_local) == 5.0


def test_write_sync_json_shape(tmp_path):
    exp_dir = tmp_path / "exp"
    (exp_dir / "derived").mkdir(parents=True)

    per_drone = {
        "2": {
            "ulog_arm_us": 1000,
            "sm_arm_local_ts": 11412.04,
            "note": "",
        },
        "3": {
            "ulog_arm_us": None,
            "sm_arm_local_ts": None,
            "note": "never armed",
        },
    }

    result = write_sync(exp_dir, per_drone)

    assert result == {
        "mode": "arm",
        "drones": {
            "2": {
                "ulog_arm_us": 1000,
                "sm_arm_local_ts": 11412.04,
                "synced": True,
                "note": "",
            },
            "3": {
                "ulog_arm_us": None,
                "sm_arm_local_ts": None,
                "synced": False,
                "note": "never armed",
            },
        },
    }

    sync_path = exp_dir / "derived" / "sync.json"
    assert sync_path.is_file()
    with open(sync_path) as f:
        on_disk = json.load(f)
    assert on_disk == result


def test_write_sync_ulog_only_mixed_row_synced_true(tmp_path):
    """Design §8: ulog ARM present, SM missing → synced True, note 'ulog only'."""
    exp_dir = tmp_path / "exp"
    (exp_dir / "derived").mkdir(parents=True)

    per_drone = {
        "3": {
            "ulog_arm_us": 987654321,
            "sm_arm_local_ts": None,
            "note": "ulog only",
        },
    }

    result = write_sync(exp_dir, per_drone)

    assert result["drones"]["3"] == {
        "ulog_arm_us": 987654321,
        "sm_arm_local_ts": None,
        "synced": True,
        "note": "ulog only",
    }


def test_write_sync_sm_present_without_ulog_arm_synced_false(tmp_path):
    """synced iff ulog_arm_us is not None — SM alone does not sync."""
    exp_dir = tmp_path / "exp"
    (exp_dir / "derived").mkdir(parents=True)

    per_drone = {
        "2": {
            "ulog_arm_us": None,
            "sm_arm_local_ts": 11412.04,
            "note": "sm only",
        },
    }

    result = write_sync(exp_dir, per_drone)

    assert result["drones"]["2"]["synced"] is False
    assert result["drones"]["2"]["ulog_arm_us"] is None
    assert result["drones"]["2"]["sm_arm_local_ts"] == 11412.04
