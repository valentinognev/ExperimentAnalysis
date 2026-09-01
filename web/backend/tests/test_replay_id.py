import pytest

from ea.replay_id import (
    is_replay_id,
    next_replay_index,
    parent_id,
    physical_id,
    replay_id,
    replay_index,
)


def test_parse_replay_id():
    assert is_replay_id("2_r1") is True
    assert is_replay_id(2) is False
    assert is_replay_id("2") is False
    assert parent_id("2_r1") == 2
    assert replay_index("2_r1") == 1
    assert replay_id(2, 3) == "2_r3"


def test_physical_id():
    assert physical_id(2) == 2
    assert physical_id("4") == 4
    assert physical_id("2_r1") == 2
    assert physical_id("x") is None


def test_next_index_monotonic_does_not_reuse():
    assert next_replay_index([2, 3, "2_r1", "2_r2", "3_r1"], 2) == 3
    assert next_replay_index(["2_r1", "2_r3"], 2) == 4
    assert next_replay_index([2], 2) == 1


def test_parent_and_index_reject_non_replay():
    with pytest.raises(ValueError):
        parent_id(2)
    with pytest.raises(ValueError):
        parent_id("2")
    with pytest.raises(ValueError):
        replay_index("x")
    with pytest.raises(ValueError):
        replay_index(2)
