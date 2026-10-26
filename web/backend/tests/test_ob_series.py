"""Observation command channels are steps on the experiment clock."""

from __future__ import annotations

import json
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq

from ea.duration import experiment_t_max_s
from ea.manifest import empty_manifest, save_manifest
from ea.series import channel_value_at_t, series
from ea.topics import list_topics

_COLUMNS = (
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
_FLOAT_COLUMNS = frozenset(_COLUMNS) - {"mission_type"}


def _command_table(rows: list[dict]) -> pa.Table:
    data: dict[str, pa.Array] = {}
    for name in _COLUMNS:
        values = [row.get(name) for row in rows]
        if name in _FLOAT_COLUMNS:
            data[name] = pa.array(values, type=pa.float64())
        else:
            data[name] = pa.array(values, type=pa.int64())
    return pa.table(data)


def _command_rows() -> list[dict]:
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


def _write_command(root: Path) -> None:
    obs = root / "derived" / "observation"
    obs.mkdir(parents=True)
    pq.write_table(_command_table(_command_rows()), obs / "command.parquet")
    (obs / "anchor.json").write_text(
        json.dumps({"arm_recv_s": 1000}) + "\n",
        encoding="utf-8",
    )


def _write_empty_manifest(root: Path) -> None:
    save_manifest(root / "manifest.json", empty_manifest("ob"))


def _write_series_fixture(root: Path) -> None:
    """Command rows plus a sync horizon. Does not publish duration."""
    _write_command(root)
    _write_empty_manifest(root)
    (root / "derived" / "sync.json").write_text(
        json.dumps({"t_max_s": 20, "drones": {}}) + "\n",
        encoding="utf-8",
    )


def _write_duration_fixture(root: Path) -> None:
    """Same commands, no sync t_max_s, manifest with no drones."""
    _write_command(root)
    _write_empty_manifest(root)


def test_ob_series_is_a_step(tmp_path: Path):
    _write_series_fixture(tmp_path)
    out = series(tmp_path, ["ob.ob.command.gs_goto_speed"])
    assert out["ob.ob.command.gs_goto_speed"]["t"] == [-5.0, 10.0, 10.0, 20.0]
    assert out["ob.ob.command.gs_goto_speed"]["y"] == [1.0, 1.0, 3.0, 3.0]


def test_ob_value_at_t_holds(tmp_path: Path):
    _write_series_fixture(tmp_path)
    assert channel_value_at_t(tmp_path, "ob.ob.command.gs_goto_speed", 0.0) == 1.0
    assert channel_value_at_t(tmp_path, "ob.ob.command.gs_goto_speed", 10.0) == 3.0


def test_topics_list_ob_command_fields(tmp_path: Path):
    _write_command(tmp_path)
    tree = list_topics(tmp_path)
    assert "gs_goto_speed" in tree["ob"]["ob"]["command"]
    assert "t_recv_s" not in tree["ob"]["ob"]["command"]


def test_duration_includes_last_command(tmp_path: Path):
    _write_duration_fixture(tmp_path)
    assert experiment_t_max_s(tmp_path) == 10.0
