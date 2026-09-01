from __future__ import annotations

from pathlib import Path

from pyulog import ULog

ATTITUDE_FIELDS = ("q[0]", "q[1]", "q[2]", "q[3]")
LOCAL_FIELDS = ("x", "y", "z")


def _dataset(ulog: ULog, name: str):
    try:
        return ulog.get_dataset(name)
    except (KeyError, IndexError, ValueError):
        return None


def _floats(values) -> list[float]:
    return [float(v) for v in values]


def _timestamps(ds) -> list[float]:
    if ds is None:
        return []
    return [float(t) * 1e-6 for t in ds.data["timestamp"]]


def _field_values(ds, field: str) -> list[float]:
    if ds is None or field not in ds.data:
        return []
    return _floats(ds.data[field])


def _numeric_fields(*datasets) -> list[str]:
    names: set[str] = set()
    for ds in datasets:
        if ds is None:
            continue
        for name, arr in ds.data.items():
            if name == "timestamp":
                continue
            kind = getattr(getattr(arr, "dtype", None), "kind", "")
            if kind in "iuf":
                names.add(name)
    return sorted(names)


def _topic_fields(ds_o, ds_r, fields: list[str] | tuple[str, ...]) -> dict:
    t_original = _timestamps(ds_o)
    t_replayed = _timestamps(ds_r)
    out: dict = {}
    for field in fields:
        original = _field_values(ds_o, field)
        replayed = _field_values(ds_r, field)
        out[field] = {
            "t_original": t_original if original else [],
            "original": original,
            "t_replayed": t_replayed if replayed else [],
            "replayed": replayed,
        }
    return out


def overlay_series(original: Path, replayed: Path) -> dict:
    ulog_o = ULog(str(original))
    ulog_r = ULog(str(replayed))
    result: dict = {}

    topics: list[tuple[str, tuple[str, ...] | None]] = [
        ("vehicle_attitude", ATTITUDE_FIELDS),
        ("vehicle_local_position", LOCAL_FIELDS),
        ("estimator_innovations", None),
    ]
    for name, fixed_fields in topics:
        ds_o = _dataset(ulog_o, name)
        ds_r = _dataset(ulog_r, name)
        if ds_o is None and ds_r is None:
            continue
        fields = fixed_fields if fixed_fields is not None else _numeric_fields(ds_o, ds_r)
        result[name] = _topic_fields(ds_o, ds_r, fields)
    return result
