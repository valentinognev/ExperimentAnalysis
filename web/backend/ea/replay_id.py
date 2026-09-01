import re

REPLAY_ID_RE = re.compile(r"^(?P<i>\d+)_r(?P<j>\d+)$")


def _match(drone_id: object) -> re.Match[str] | None:
    if not isinstance(drone_id, str):
        return None
    return REPLAY_ID_RE.fullmatch(drone_id)


def is_replay_id(drone_id: object) -> bool:
    return _match(drone_id) is not None


def parent_id(drone_id: object) -> int:
    m = _match(drone_id)
    if m is None:
        raise ValueError(f"not a replay id: {drone_id!r}")
    return int(m.group("i"))


def replay_index(drone_id: object) -> int:
    m = _match(drone_id)
    if m is None:
        raise ValueError(f"not a replay id: {drone_id!r}")
    return int(m.group("j"))


def replay_id(parent: int, j: int) -> str:
    return f"{parent}_r{j}"


def physical_id(drone_id: object) -> int | None:
    if isinstance(drone_id, bool):
        return None
    if isinstance(drone_id, int):
        return drone_id
    if isinstance(drone_id, str):
        if drone_id.isdigit():
            return int(drone_id)
        m = _match(drone_id)
        if m is not None:
            return int(m.group("i"))
    return None


def next_replay_index(existing_ids: list, parent: int) -> int:
    max_j = 0
    for did in existing_ids:
        if is_replay_id(did) and parent_id(did) == parent:
            max_j = max(max_j, replay_index(did))
    return max_j + 1
