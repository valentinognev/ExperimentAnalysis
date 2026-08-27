"""Extract hardware adapter text logs to Parquet when timestamps are recoverable."""

from __future__ import annotations

import re
from datetime import datetime
from pathlib import Path
from typing import Literal

import pandas as pd

HA_DIAG_PARQUET = "ha_diag.parquet"
HA_MAVLINK_PARQUET = "ha_mavlink.parquet"

_DATETIME_LINE = re.compile(r"^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})(.*)$")
_FLOAT_LINE = re.compile(r"^\s*([\d.]+)(.*)$")


def _parquet_name(log_path: Path) -> str:
    name = log_path.name.lower()
    if "mavlink" in name:
        return HA_MAVLINK_PARQUET
    return HA_DIAG_PARQUET


def _parseable_line(line: str) -> bool:
    stripped = line.strip()
    if not stripped or stripped.startswith("#"):
        return False
    if re.match(r"^\d{4}-\d{2}-\d{2}", stripped):
        return True
    if re.match(r"^[\d.]+", stripped):
        return True
    return False


def _parse_line(line: str) -> tuple[float, str] | None:
    stripped = line.strip()
    if not stripped or stripped.startswith("#"):
        return None

    m = _DATETIME_LINE.match(stripped)
    if m:
        try:
            ts = datetime.strptime(m.group(1), "%Y-%m-%d %H:%M:%S").timestamp()
        except ValueError:
            return None
        return ts, (m.group(2).strip() or stripped)

    m = _FLOAT_LINE.match(stripped)
    if m:
        try:
            ts = float(m.group(1))
        except ValueError:
            return None
        return ts, (m.group(2).strip() or stripped)

    return None


def extract_ha(log_path: Path, dest_dir: Path) -> Path | Literal["skipped"]:
    rows: list[dict] = []
    for raw_line in log_path.read_text(encoding="utf-8", errors="replace").splitlines():
        if not _parseable_line(raw_line):
            continue
        parsed = _parse_line(raw_line)
        if parsed is None:
            continue
        ts, text = parsed
        rows.append({"timestamp": ts, "line": text})

    if not rows:
        return "skipped"

    dest_dir.mkdir(parents=True, exist_ok=True)
    out = dest_dir / _parquet_name(log_path)
    pd.DataFrame(rows).to_parquet(out, index=False)
    return out
