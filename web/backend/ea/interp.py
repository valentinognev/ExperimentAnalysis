"""Linear scalar and quaternion (xyzw) interpolation."""

from __future__ import annotations

import math

import numpy as np


def interp_scalar(t: float, ts: list[float], ys: list[float]) -> float | None:
    if not ts:
        return None
    if t < ts[0] or t > ts[-1]:
        return None
    return float(np.interp(t, ts, ys))


def _normalize_xyzw(q: tuple[float, float, float, float]) -> np.ndarray:
    v = np.array(q, dtype=float)
    n = np.linalg.norm(v)
    if n == 0:
        return v
    return v / n


def _slerp_pair(
    q0: tuple[float, float, float, float],
    q1: tuple[float, float, float, float],
    frac: float,
) -> tuple[float, float, float, float]:
    a = _normalize_xyzw(q0)
    b = _normalize_xyzw(q1)
    dot = float(np.dot(a, b))
    if dot < 0:
        b = -b
        dot = -dot
    if dot > 0.9995:
        out = a + frac * (b - a)
        out = _normalize_xyzw(tuple(out))
        return (float(out[0]), float(out[1]), float(out[2]), float(out[3]))
    theta_0 = math.acos(min(1.0, dot))
    sin_theta_0 = math.sin(theta_0)
    if sin_theta_0 < 1e-10:
        out = a
        return (float(out[0]), float(out[1]), float(out[2]), float(out[3]))
    theta = theta_0 * frac
    s0 = math.sin(theta_0 - theta) / sin_theta_0
    s1 = math.sin(theta) / sin_theta_0
    out = s0 * a + s1 * b
    return (float(out[0]), float(out[1]), float(out[2]), float(out[3]))


def slerp_xyzw(
    t: float,
    ts: list[float],
    quats_xyzw: list[tuple[float, float, float, float]],
) -> tuple[float, float, float, float] | None:
    if not ts:
        return None
    if t < ts[0] or t > ts[-1]:
        return None
    if t == ts[0]:
        return quats_xyzw[0]
    if t == ts[-1]:
        return quats_xyzw[-1]
    for i in range(len(ts) - 1):
        t0, t1 = ts[i], ts[i + 1]
        if t0 <= t <= t1:
            if t1 == t0:
                return quats_xyzw[i]
            frac = (t - t0) / (t1 - t0)
            return _slerp_pair(quats_xyzw[i], quats_xyzw[i + 1], frac)
    return None
