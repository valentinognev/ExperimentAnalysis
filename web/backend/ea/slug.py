import re

_KEEP = re.compile(r"[^A-Za-z0-9_-]+")


def slugify(name: str) -> str:
    s = _KEEP.sub("_", name.strip()).strip("_")
    s = re.sub(r"_+", "_", s)
    if not s or not re.fullmatch(r"[A-Za-z0-9_-]+", s):
        raise ValueError(f"invalid experiment name: {name!r}")
    return s
