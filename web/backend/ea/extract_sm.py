"""Extract System Manager CSV to Parquet."""

from __future__ import annotations

from pathlib import Path
from typing import Literal

import pandas as pd

SM_PARQUET_NAME = "sm_system_manager.parquet"


def extract_sm(csv_path: Path, dest_dir: Path) -> Path | Literal["skipped"]:
    dest_dir.mkdir(parents=True, exist_ok=True)
    try:
        df = pd.read_csv(csv_path)
    except (pd.errors.EmptyDataError, pd.errors.ParserError):
        return "skipped"
    if df.empty:
        return "skipped"
    out = dest_dir / SM_PARQUET_NAME
    df.to_parquet(out, index=False)
    return out
