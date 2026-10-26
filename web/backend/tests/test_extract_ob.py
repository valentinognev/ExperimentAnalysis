import csv
import json
from pathlib import Path

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

from ea.extract_ob import COMMAND_COLUMNS, extract_ob

_OBS_COLUMNS = [
    "recv_time_s",
    "kind",
    "drone_id",
    "armed",
    "mission_type",
    "gs_goto_speed",
    "gs_takeoff_altitude",
    "gs_takeoff_delta",
    "gs_formation_radius",
    "gs_formation_heading",
    "gs_goto_x",
    "gs_goto_y",
]


def _write_obs(path: Path, rows: list[dict]) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=_OBS_COLUMNS)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def test_command_columns_are_the_panel_fields():
    assert COMMAND_COLUMNS == (
        "mission_type",
        "gs_goto_speed",
        "gs_takeoff_altitude",
        "gs_takeoff_delta",
        "gs_formation_radius",
        "gs_formation_heading",
        "gs_goto_x",
        "gs_goto_y",
    )


def test_extract_emits_changes_and_arm_anchor(tmp_path: Path):
    csv_path = tmp_path / "obs_20261026_100000z.csv"
    _write_obs(
        csv_path,
        [
            {
                "recv_time_s": 1000,
                "kind": "gs_control",
                "mission_type": 0,
                "gs_goto_speed": 1,
            },
            {
                "recv_time_s": 1001,
                "kind": "drone_update",
                "drone_id": 2,
                "armed": 1,
            },
            {
                "recv_time_s": 1010,
                "kind": "gs_control",
                "gs_goto_speed": 3,
                "gs_formation_radius": 2,
                "gs_goto_x": 0.5,
                "gs_goto_y": 0,
            },
        ],
    )
    out = extract_ob(csv_path, tmp_path / "derived", main_drone_id=4)
    df = pd.read_parquet(out)
    assert list(df.columns) == ["t_recv_s", *COMMAND_COLUMNS]
    assert list(df["t_recv_s"]) == [1000.0, 1010.0]
    assert df.loc[0, "mission_type"] == 0
    assert df.loc[0, "gs_goto_speed"] == 1.0
    assert pd.isna(df.loc[0, "gs_formation_radius"])
    assert pd.isna(df.loc[0, "gs_goto_y"])
    assert df.loc[1, "gs_goto_speed"] == 3.0
    assert df.loc[1, "gs_formation_radius"] == 2.0
    assert df.loc[1, "gs_goto_x"] == 0.5
    assert df.loc[1, "gs_goto_y"] == 0.0
    assert df.loc[1, "mission_type"] == 0
    anchor = json.loads((tmp_path / "derived" / "anchor.json").read_text())
    assert anchor["arm_recv_s"] == 1001.0


def test_arm_anchor_prefers_main_drone(tmp_path: Path):
    csv_path = tmp_path / "obs_main.csv"
    dest = tmp_path / "derived"
    _write_obs(
        csv_path,
        [
            {
                "recv_time_s": 1000,
                "kind": "drone_update",
                "drone_id": 2,
                "armed": 1,
                "mission_type": 0,
            },
            {
                "recv_time_s": 1005,
                "kind": "drone_update",
                "drone_id": 4,
                "armed": 1,
            },
        ],
    )
    extract_ob(csv_path, dest, main_drone_id=4)
    assert json.loads((dest / "anchor.json").read_text())["arm_recv_s"] == 1005.0


def test_arm_anchor_uses_any_drone_when_ids_are_not_numeric(tmp_path: Path):
    csv_path = tmp_path / "obs_any.csv"
    dest = tmp_path / "derived"
    _write_obs(
        csv_path,
        [
            {
                "recv_time_s": 1000,
                "kind": "drone_update",
                "drone_id": "b",
                "armed": 1,
                "mission_type": 1,
            },
            {
                "recv_time_s": 1005,
                "kind": "drone_update",
                "drone_id": "a",
                "armed": 1,
            },
        ],
    )
    extract_ob(csv_path, dest, main_drone_id=4)
    assert json.loads((dest / "anchor.json").read_text())["arm_recv_s"] == 1000.0


def test_arm_anchor_uses_lowest_numeric_drone_when_main_never_arms(tmp_path: Path):
    csv_path = tmp_path / "obs_lowest.csv"
    dest = tmp_path / "derived"
    _write_obs(
        csv_path,
        [
            {
                "recv_time_s": 1000,
                "kind": "drone_update",
                "drone_id": 10,
                "armed": 1,
                "mission_type": 0,
            },
            {
                "recv_time_s": 1004,
                "kind": "drone_update",
                "drone_id": 3,
                "armed": 1,
            },
        ],
    )
    extract_ob(csv_path, dest, main_drone_id=9)
    assert json.loads((dest / "anchor.json").read_text())["arm_recv_s"] == 1004.0


def test_armed_string_one_and_true_count(tmp_path: Path):
    true_csv = tmp_path / "obs_true.csv"
    true_dest = tmp_path / "true"
    _write_obs(
        true_csv,
        [
            {
                "recv_time_s": 1000,
                "kind": "drone_update",
                "drone_id": 2,
                "armed": "1",
                "mission_type": 0,
            },
            {
                "recv_time_s": 1005,
                "kind": "drone_update",
                "drone_id": 4,
                "armed": "true",
            },
        ],
    )
    extract_ob(true_csv, true_dest, main_drone_id=4)
    assert json.loads((true_dest / "anchor.json").read_text())["arm_recv_s"] == 1005.0

    one_csv = tmp_path / "obs_one.csv"
    one_dest = tmp_path / "one"
    _write_obs(
        one_csv,
        [
            {
                "recv_time_s": 1000,
                "kind": "drone_update",
                "drone_id": 2,
                "armed": "1",
                "gs_goto_speed": 1,
            }
        ],
    )
    extract_ob(one_csv, one_dest, main_drone_id=4)
    assert json.loads((one_dest / "anchor.json").read_text())["arm_recv_s"] == 1000.0


def test_no_armed_row_writes_null_anchor_and_command(tmp_path: Path):
    csv_path = tmp_path / "obs_no_arm.csv"
    dest = tmp_path / "derived"
    _write_obs(
        csv_path,
        [
            {
                "recv_time_s": 1000,
                "kind": "gs_control",
                "gs_goto_speed": 1,
                "gs_goto_y": 0,
            }
        ],
    )
    out = extract_ob(csv_path, dest, main_drone_id=4)
    assert out != "skipped"
    df = pd.read_parquet(out)
    assert list(df["t_recv_s"]) == [1000.0]
    assert df.loc[0, "gs_goto_speed"] == 1.0
    assert df.loc[0, "gs_goto_y"] == 0.0
    assert pd.isna(df.loc[0, "mission_type"])
    assert pq.read_schema(out).field("mission_type").type == pa.int64()
    assert pq.read_schema(out).field("t_recv_s").type == pa.float64()
    assert pq.read_schema(out).field("gs_goto_y").type == pa.float64()
    anchor = json.loads((dest / "anchor.json").read_text())
    assert anchor == {"arm_recv_s": None}


def test_repeated_command_cells_do_not_emit_another_row(tmp_path: Path):
    csv_path = tmp_path / "obs_echo.csv"
    dest = tmp_path / "derived"
    _write_obs(
        csv_path,
        [
            {
                "recv_time_s": 1000,
                "kind": "gs_control",
                "mission_type": 0,
                "gs_goto_speed": 1,
                "gs_goto_y": 0,
            },
            {
                "recv_time_s": 1002,
                "kind": "drone_update",
                "drone_id": 2,
                "armed": 1,
                "mission_type": 0,
                "gs_goto_speed": 1,
                "gs_goto_y": 0,
            },
        ],
    )
    out = extract_ob(csv_path, dest, main_drone_id=2)
    df = pd.read_parquet(out)
    assert list(df["t_recv_s"]) == [1000.0]
    assert df.loc[0, "gs_goto_y"] == 0.0
    assert json.loads((dest / "anchor.json").read_text())["arm_recv_s"] == 1002.0


def test_extract_skips_header_only(tmp_path: Path):
    header_only = tmp_path / "obs_header.csv"
    header_only.write_text(",".join(_OBS_COLUMNS) + "\n", encoding="utf-8")
    assert extract_ob(header_only, tmp_path / "derived") == "skipped"
    assert not (tmp_path / "derived" / "command.parquet").exists()
    assert not (tmp_path / "derived" / "anchor.json").exists()


def test_extract_skips_rows_without_command_values(tmp_path: Path):
    csv_path = tmp_path / "obs_armed_only.csv"
    dest = tmp_path / "derived"
    _write_obs(
        csv_path,
        [
            {
                "recv_time_s": 1001,
                "kind": "drone_update",
                "drone_id": 2,
                "armed": 1,
            }
        ],
    )
    assert extract_ob(csv_path, dest, main_drone_id=2) == "skipped"
    assert not (dest / "command.parquet").exists()
    assert not (dest / "anchor.json").exists()
