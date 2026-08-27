import math

import pytest

from ea.interp import interp_scalar, slerp_xyzw


def test_interp_scalar_midpoint():
    assert interp_scalar(5, [0, 10], [0, 10]) == pytest.approx(5.0)


def test_interp_scalar_before_range():
    assert interp_scalar(-1, [0, 10], [0, 10]) is None


def test_interp_scalar_after_range():
    assert interp_scalar(11, [0, 10], [0, 10]) is None


def test_interp_scalar_empty_ts():
    assert interp_scalar(5, [], [0, 10]) is None


def test_interp_scalar_at_endpoints():
    ts = [0, 10]
    ys = [0, 10]
    assert interp_scalar(0, ts, ys) == pytest.approx(0.0)
    assert interp_scalar(10, ts, ys) == pytest.approx(10.0)


def test_slerp_identity_to_90deg_z_midpoint():
    half = math.sin(math.pi / 8)
    q0 = (0.0, 0.0, 0.0, 1.0)
    q1 = (0.0, 0.0, math.sin(math.pi / 4), math.cos(math.pi / 4))
    result = slerp_xyzw(5, [0, 10], [q0, q1])
    assert result is not None
    x, y, z, w = result
    assert x == pytest.approx(0.0, abs=1e-6)
    assert y == pytest.approx(0.0, abs=1e-6)
    assert z == pytest.approx(half, abs=1e-6)
    assert w == pytest.approx(math.cos(math.pi / 8), abs=1e-6)


def test_slerp_at_endpoints():
    q0 = (0.0, 0.0, 0.0, 1.0)
    q1 = (0.0, 0.0, math.sin(math.pi / 4), math.cos(math.pi / 4))
    ts = [0, 10]
    quats = [q0, q1]
    assert slerp_xyzw(0, ts, quats) == pytest.approx(q0, abs=1e-6)
    assert slerp_xyzw(10, ts, quats) == pytest.approx(q1, abs=1e-6)


def test_slerp_outside_range():
    q0 = (0.0, 0.0, 0.0, 1.0)
    q1 = (0.0, 0.0, 1.0, 0.0)
    ts = [0, 10]
    quats = [q0, q1]
    assert slerp_xyzw(-1, ts, quats) is None
    assert slerp_xyzw(11, ts, quats) is None


def test_slerp_empty_ts():
    assert slerp_xyzw(5, [], [(0.0, 0.0, 0.0, 1.0)]) is None
