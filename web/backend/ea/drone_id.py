import re

_CAT = re.compile(r"Group3RLcat(?P<id>\d+)_")
_D = re.compile(r"_d(?P<id>\d+)(?:\.|_)")


def drone_id_from_filename(name: str) -> int | None:
    m = _CAT.search(name)
    if m:
        return int(m.group("id"))
    m = _D.search(name)
    if m:
        return int(m.group("id"))
    return None
