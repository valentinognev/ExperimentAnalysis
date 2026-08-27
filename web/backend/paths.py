import os
from pathlib import Path


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def experiments_dir() -> Path:
    override = os.environ.get("EA_EXPERIMENTS_DIR")
    if override:
        return Path(override)
    return repo_root() / "experiments"
