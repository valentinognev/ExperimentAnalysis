"""Replay GPS is excluded from the world origin; replay time uses parent offset."""

from pathlib import Path

import pytest

from ea.arm import ulog_arm_us
from ea.extract_ulog import extract_ulog
from ea.manifest import empty_manifest, load_manifest, save_manifest
from ea.pose import pose_at
from ea.series import series
from ea.sync import write_sync
from ea.ulog_min import write_min_ulog

_D2_LAT, _D2_LON, _D2_ALT = 320800000, 347800000, 50000
_D3_LAT, _D3_LON, _D3_ALT = 321000000, 348000000, 60000
_REPLAY_LAT = 330800000  # 1° north of D2


def _extract_drone(exp_dir: Path, drone_id, ulg: Path) -> Path:
    dest = exp_dir / "derived" / f"drone_{drone_id}"
    extract_ulog(ulg, dest)
    return dest


def _gps_ulog(arm_us: int, lat: int, lon: int, alt: int) -> dict:
    return {
        "vehicle_status": [
            {"timestamp": 1000, "arming_state": 1},
            {"timestamp": arm_us, "arming_state": 2},
        ],
        "vehicle_local_position": [
            {"timestamp": arm_us, "x": 0.0, "y": 0.0, "z": 0.0},
            {"timestamp": arm_us + 10000, "x": 1.0, "y": 0.0, "z": 0.0},
        ],
        "vehicle_attitude": [
            {"timestamp": arm_us, "q[0]": 1.0, "q[1]": 0.0, "q[2]": 0.0, "q[3]": 0.0},
            {"timestamp": arm_us + 10000, "q[0]": 1.0, "q[1]": 0.0, "q[2]": 0.0, "q[3]": 0.0},
        ],
        "vehicle_gps_position": [
            {"timestamp": arm_us, "lat": lat, "lon": lon, "alt": alt},
        ],
    }


def _save_manifest(exp_dir: Path, drone_ids: list) -> None:
    manifest = empty_manifest("test")
    manifest["drones"] = [
        {
            "id": did,
            "label": f"D{did}",
            "sources": {"ulg": [], "system_manager": [], "hardware_adapter": []},
        }
        for did in drone_ids
    ]
    save_manifest(exp_dir / "manifest.json", manifest)


def _write_sync_all(exp_dir: Path, drone_ids: list) -> None:
    per_drone = {}
    for did in drone_ids:
        derived = exp_dir / "derived" / f"drone_{did}"
        per_drone[str(did)] = {
            "ulog_arm_us": ulog_arm_us(derived / "vehicle_status.parquet", None),
            "sm_arm_local_ts": None,
        }
    write_sync(exp_dir, per_drone)


def _build_physical_plus_replay(tmp_path) -> Path:
    exp_dir = tmp_path / "exp"
    exp_dir.mkdir()
    specs = (
        (2, 5000, _D2_LAT, _D2_LON, _D2_ALT),
        (3, 5000, _D3_LAT, _D3_LON, _D3_ALT),
        ("2_r1", 9000, _REPLAY_LAT, _D2_LON, _D2_ALT),
    )
    for did, arm_us, lat, lon, alt in specs:
        ulg = tmp_path / f"drone_{did}.ulg"
        write_min_ulog(ulg, _gps_ulog(arm_us, lat, lon, alt))
        _extract_drone(exp_dir, did, ulg)
    ids = [2, 3, "2_r1"]
    _write_sync_all(exp_dir, ids)
    _save_manifest(exp_dir, ids)
    return exp_dir


def test_origin_ignores_replay_gps_one_degree_away(tmp_path):
    exp_dir = _build_physical_plus_replay(tmp_path)

    origin = pose_at(exp_dir, t=0.0)["origin"]
    assert origin["lat"] == pytest.approx(32.09, abs=1e-6)
    assert origin["lon"] == pytest.approx(34.79, abs=1e-6)
    assert origin["alt_m"] == pytest.approx(55.0, abs=1e-6)


def test_replay_pose_and_series_use_parent_offset(tmp_path):
    exp_dir = _build_physical_plus_replay(tmp_path)

    baseline = pose_at(exp_dir, t=0.0)
    ekf_baseline = baseline["drones"]["2_r1"]["avatars"]["ekf_ned"]

    manifest = load_manifest(exp_dir / "manifest.json")
    manifest["sync"]["manual_offsets_s"] = {"2": 1.5}
    save_manifest(exp_dir / "manifest.json", manifest)

    offset_at = pose_at(exp_dir, t=1.5)
    ekf_offset = offset_at["drones"]["2_r1"]["avatars"]["ekf_ned"]
    assert ekf_offset["e"] == pytest.approx(ekf_baseline["e"], abs=1e-6)
    assert ekf_offset["n"] == pytest.approx(ekf_baseline["n"], abs=1e-6)
    assert ekf_offset["u"] == pytest.approx(ekf_baseline["u"], abs=1e-6)

    ch = series(exp_dir, ["2_r1.ulog.vehicle_local_position.x"])
    assert ch["2_r1.ulog.vehicle_local_position.x"]["t"][0] == pytest.approx(1.5)
