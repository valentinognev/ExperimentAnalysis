from __future__ import annotations

import shutil
from pathlib import Path


def find_newest_replayed(log_root: Path) -> Path | None:
    matches = list(log_root.glob("**/*_replayed.ulg"))
    if not matches:
        return None
    return max(matches, key=lambda p: p.stat().st_mtime)


def collect_results(run_id: str, log_root: Path, results_root: Path, px4_log: str) -> dict:
    dest_dir = results_root / run_id
    dest_dir.mkdir(parents=True, exist_ok=True)
    (dest_dir / "px4.log").write_text(px4_log)
    src = find_newest_replayed(log_root)
    if src is None:
        return {"ok": False, "replayed_ulg": None, "results_dir": str(dest_dir)}
    dest = dest_dir / src.name
    shutil.copy2(src, dest)
    return {"ok": True, "replayed_ulg": str(dest), "results_dir": str(dest_dir)}
