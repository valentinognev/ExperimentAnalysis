"""Hold-last mission snapshot at experiment time."""

from __future__ import annotations

import json
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq

from ea.manifest import empty_manifest, save_manifest
from ea.mission_command import mission_at
from ea.pose import pose_at


def _command_table(rows: list[dict]) -> pa.Table:
    columns = (
        "t_recv_s",
        "mission_type",
        "gs_goto_speed",
        "gs_takeoff_altitude",
        "gs_takeoff_delta",
        "gs_formation_radius",
        "gs_formation_heading",
        "gs_goto_x",
        "gs_goto_y",
    )
    float_cols = {
        "t_recv_s",
        "gs_goto_speed",
        "gs_takeoff_altitude",
        "gs_takeoff_delta",
        "gs_formation_radius",
        "gs_formation_heading",
        "gs_goto_x",
        "gs_goto_y",
    }
    data: dict[str, pa.Array] = {}
    for name in columns:
        values = [row.get(name) for row in rows]
        if name in float_cols:
            data[name] = pa.array(values, type=pa.float64())
        else:
            data[name] = pa.array(values, type=pa.int64())
    return pa.table(data)


def _write_command(root: Path, rows: list[dict], arm_recv_s: float | None) -> None:
    obs = root / "derived" / "observation"
    obs.mkdir(parents=True)
    pq.write_table(_command_table(rows), obs / "command.parquet")
    if arm_recv_s is not None:
        (obs / "anchor.json").write_text(json.dumps({"arm_recv_s": arm_recv_s}))


def _hold_rows() -> list[dict]:
    return [
        {
            "t_recv_s": 995.0,
            "mission_type": 0,
            "gs_goto_speed": 1.0,
            "gs_takeoff_altitude": None,
            "gs_takeoff_delta": 0.0,
            "gs_formation_radius": None,
            "gs_formation_heading": None,
            "gs_goto_x": None,
            "gs_goto_y": None,
        },
        {
            "t_recv_s": 1010.0,
            "mission_type": 0,
            "gs_goto_speed": 3.0,
            "gs_takeoff_altitude": None,
            "gs_takeoff_delta": 0.0,
            "gs_formation_radius": 2.0,
            "gs_formation_heading": None,
            "gs_goto_x": 0.5,
            "gs_goto_y": 0.0,
        },
    ]


def test_hold_includes_pre_arm_and_hides_future(tmp_path: Path):
    _write_command(tmp_path, _hold_rows(), arm_recv_s=1000)
    at0 = mission_at(tmp_path, 0.0)
    assert at0["mission_label"] == "NONE"
    assert at0["vmax"] == 1.0
    assert at0["delta_m"] == 0.0
    assert at0["radius_m"] is None
    assert at0["dest_x_m"] is None
    later = mission_at(tmp_path, 10.0)
    assert later["vmax"] == 3.0
    assert later["radius_m"] == 2.0
    assert later["dest_x_m"] == 0.5
    assert later["dest_y_m"] == 0.0
    early = mission_at(tmp_path, 9.0)
    assert early["vmax"] == 1.0
    assert early["radius_m"] is None


def test_zero_is_a_value(tmp_path: Path):
    _write_command(tmp_path, _hold_rows(), arm_recv_s=1000)
    snap = mission_at(tmp_path, 10.0)
    assert snap["mission_type"] == 0
    assert snap["mission_label"] == "NONE"
    assert snap["delta_m"] == 0.0
    assert snap["dest_y_m"] == 0.0


def test_missing_parquet_is_none(tmp_path: Path):
    assert mission_at(tmp_path, 0.0) is None


def test_before_first_command_is_blank(tmp_path: Path):
    _write_command(
        tmp_path,
        [
            {
                "t_recv_s": 10.0,
                "mission_type": 0,
                "gs_goto_speed": 1.0,
                "gs_takeoff_altitude": None,
                "gs_takeoff_delta": 0.0,
                "gs_formation_radius": None,
                "gs_formation_heading": None,
                "gs_goto_x": None,
                "gs_goto_y": None,
            }
        ],
        arm_recv_s=0,
    )
    blank = mission_at(tmp_path, -1.0)
    assert blank["vmax"] is None
    assert blank["mission_label"] is None


def test_missing_anchor_uses_first_recv(tmp_path: Path):
    _write_command(
        tmp_path,
        [
            {
                "t_recv_s": 100.0,
                "mission_type": 1,
                "gs_goto_speed": 1.0,
                "gs_takeoff_altitude": None,
                "gs_takeoff_delta": None,
                "gs_formation_radius": None,
                "gs_formation_heading": None,
                "gs_goto_x": None,
                "gs_goto_y": None,
            },
            {
                "t_recv_s": 110.0,
                "mission_type": 1,
                "gs_goto_speed": 4.0,
                "gs_takeoff_altitude": None,
                "gs_takeoff_delta": None,
                "gs_formation_radius": None,
                "gs_formation_heading": None,
                "gs_goto_x": None,
                "gs_goto_y": None,
            },
        ],
        arm_recv_s=None,
    )
    at0 = mission_at(tmp_path, 0.0)
    assert at0["vmax"] == 1.0
    assert at0["mission_label"] == "Formation NN"
    assert mission_at(tmp_path, 9.0)["vmax"] == 1.0
    assert mission_at(tmp_path, 10.0)["vmax"] == 4.0


def test_arm_zero_is_a_real_origin(tmp_path: Path):
    _write_command(
        tmp_path,
        [
            {
                "t_recv_s": 5.0,
                "mission_type": 0,
                "gs_goto_speed": 7.0,
                "gs_takeoff_altitude": None,
                "gs_takeoff_delta": None,
                "gs_formation_radius": None,
                "gs_formation_heading": None,
                "gs_goto_x": None,
                "gs_goto_y": None,
            }
        ],
        arm_recv_s=0,
    )
    assert mission_at(tmp_path, 0.0)["vmax"] is None
    assert mission_at(tmp_path, 5.0)["vmax"] == 7.0


def test_negative_mission_id_does_not_wrap(tmp_path: Path):
    _write_command(
        tmp_path,
        [
            {
                "t_recv_s": 0.0,
                "mission_type": -1,
                "gs_goto_speed": 1.0,
                "gs_takeoff_altitude": None,
                "gs_takeoff_delta": None,
                "gs_formation_radius": None,
                "gs_formation_heading": None,
                "gs_goto_x": None,
                "gs_goto_y": None,
            }
        ],
        arm_recv_s=0,
    )
    snap = mission_at(tmp_path, 0.0)
    assert snap["mission_type"] == -1
    assert snap["mission_label"] == "-1"


def test_unknown_mission_id_is_decimal_string(tmp_path: Path):
    _write_command(
        tmp_path,
        [
            {
                "t_recv_s": 0.0,
                "mission_type": 99,
                "gs_goto_speed": 1.0,
                "gs_takeoff_altitude": None,
                "gs_takeoff_delta": None,
                "gs_formation_radius": None,
                "gs_formation_heading": None,
                "gs_goto_x": None,
                "gs_goto_y": None,
            }
        ],
        arm_recv_s=0,
    )
    snap = mission_at(tmp_path, 0.0)
    assert snap["mission_type"] == 99
    assert snap["mission_label"] == "99"


def _save_pose_manifest(root: Path) -> None:
    manifest = empty_manifest("test")
    manifest["drones"] = []
    save_manifest(root / "manifest.json", manifest)


def test_pose_includes_mission_at_t(tmp_path: Path):
    _write_command(tmp_path, _hold_rows(), arm_recv_s=1000)
    _save_pose_manifest(tmp_path)
    pose = pose_at(tmp_path, 0.0)
    assert pose["mission"]["vmax"] == 1.0
    assert pose_at(tmp_path, 10.0)["mission"]["vmax"] == 3.0


def test_pose_mission_null_without_log(tmp_path: Path):
    _save_pose_manifest(tmp_path)
    assert pose_at(tmp_path, 0.0)["mission"] is None
