"""Extract System Manager CSV to Parquet."""

from __future__ import annotations

from pathlib import Path

import pandas as pd

SM_PARQUET_NAME = "sm_system_manager.parquet"


def extract_sm(csv_path: Path, dest_dir: Path) -> Path:
    dest_dir.mkdir(parents=True, exist_ok=True)
    df = pd.read_csv(csv_path)
    out = dest_dir / SM_PARQUET_NAME
    df.to_parquet(out, index=False)
    return out
