"""Extract Observation Board command changes and the ARM anchor."""

from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Literal

import pandas as pd

COMMAND_COLUMNS: tuple[str, ...] = (
    "mission_type",
    "gs_goto_speed",
    "gs_takeoff_altitude",
    "gs_takeoff_delta",
    "gs_formation_radius",
    "gs_formation_heading",
    "gs_goto_x",
    "gs_goto_y",
)


def extract_ob(
    csv_path: Path,
    dest_dir: Path,
    main_drone_id: int | None = None,
) -> Path | Literal["skipped"]:
    with csv_path.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    if not _has_command_value(rows):
        return "skipped"

    arm_recv_s = _arm_recv_s(rows, main_drone_id)
    frame = _command_frame(rows)
    dest_dir.mkdir(parents=True, exist_ok=True)
    out = dest_dir / "command.parquet"
    frame.to_parquet(out, index=False)
    _write_anchor(dest_dir, arm_recv_s)
    return out


def _has_command_value(rows: list[dict[str, str]]) -> bool:
    for row in rows:
        for column in COMMAND_COLUMNS:
            if _present(row.get(column)):
                return True
    return False


def _present(raw: str | None) -> bool:
    return raw is not None and str(raw).strip() != ""


def _parse_command(column: str, raw: str | None) -> int | float | None:
    if not _present(raw):
        return None
    text = str(raw).strip()
    if column == "mission_type":
        return int(text)
    return float(text)


def _command_frame(rows: list[dict[str, str]]) -> pd.DataFrame:
    state: dict[str, int | float | None] = {column: None for column in COMMAND_COLUMNS}
    last: tuple[int | float | None, ...] | None = None
    emitted: list[dict[str, int | float | None]] = []
    for row in rows:
        for column in COMMAND_COLUMNS:
            parsed = _parse_command(column, row.get(column))
            if parsed is not None:
                state[column] = parsed
        snapshot = tuple(state[column] for column in COMMAND_COLUMNS)
        if snapshot == last or all(value is None for value in snapshot):
            continue
        last = snapshot
        record: dict[str, int | float | None] = {"t_recv_s": float(row["recv_time_s"])}
        for column, value in zip(COMMAND_COLUMNS, snapshot, strict=True):
            record[column] = value
        emitted.append(record)

    frame = pd.DataFrame(emitted, columns=["t_recv_s", *COMMAND_COLUMNS])
    frame["t_recv_s"] = frame["t_recv_s"].astype("float64")
    frame["mission_type"] = frame["mission_type"].astype("Int64")
    for column in COMMAND_COLUMNS:
        if column == "mission_type":
            continue
        frame[column] = frame[column].astype("float64")
    return frame


def _is_armed(raw: str | None) -> bool:
    if raw is None:
        return False
    text = str(raw).strip()
    return text == "1" or text.lower() == "true"


def _drone_id(row: dict[str, str]) -> int | str | None:
    raw = row.get("drone_id")
    if not _present(raw):
        return None
    text = str(raw).strip()
    try:
        return int(text)
    except ValueError:
        return text


def _arm_recv_s(rows: list[dict[str, str]], main_drone_id: int | None) -> float | None:
    armed = [row for row in rows if _is_armed(row.get("armed"))]
    if main_drone_id is not None:
        for row in armed:
            if _drone_id(row) == main_drone_id:
                return float(row["recv_time_s"])
    lowest_id: int | None = None
    lowest_row: dict[str, str] | None = None
    for row in armed:
        drone_id = _drone_id(row)
        if isinstance(drone_id, bool) or not isinstance(drone_id, int):
            continue
        if lowest_id is None or drone_id < lowest_id:
            lowest_id = drone_id
            lowest_row = row
    if lowest_row is not None:
        return float(lowest_row["recv_time_s"])
    if not armed:
        return None
    return float(armed[0]["recv_time_s"])


def _write_anchor(dest_dir: Path, arm_recv_s: float | None) -> None:
    payload = {"arm_recv_s": arm_recv_s}
    (dest_dir / "anchor.json").write_text(
        json.dumps(payload) + "\n",
        encoding="utf-8",
    )
