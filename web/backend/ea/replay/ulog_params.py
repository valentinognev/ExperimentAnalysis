from __future__ import annotations

from pathlib import Path

from pyulog import ULog

EKF2_REQUIRED_TOPICS = ("sensor_combined", "vehicle_gps_position")


def inspect_ulog(path: Path, ulog_factory=None) -> dict:
    if ulog_factory is None:
        ulog_factory = lambda p: ULog(str(p))
    try:
        ulog = ulog_factory(path)
    except Exception as exc:
        raise ValueError(str(exc)) from exc

    params = [
        {"name": name, "value": value}
        for name, value in sorted(ulog.initial_parameters.items())
    ]
    topics = sorted({ds.name for ds in ulog.data_list})
    duration_s = (ulog.last_timestamp - ulog.start_timestamp) / 1e6
    missing = [t for t in EKF2_REQUIRED_TOPICS if t not in topics]
    warnings: list[str] = []
    if missing:
        warnings.append("missing EKF2 topics: " + ", ".join(missing))
    return {
        "params": params,
        "topics": topics,
        "duration_s": duration_s,
        "warnings": warnings,
    }
