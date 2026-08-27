"""Ground markers and distance helpers."""

from __future__ import annotations

from dataclasses import dataclass
from math import atan2, cos, pi, sin, sqrt

from ea.geo import METERS_PER_DEG_LAT, WGS84_A_M, lla_to_enu


@dataclass
class Marker:
    id: str
    label: str
    lat: float
    lon: float
    alt_m: float


def enu_to_lla(
    e: float,
    n: float,
    u: float,
    origin_lat: float,
    origin_lon: float,
    origin_alt: float,
) -> tuple[float, float, float]:
    lat = origin_lat + n / METERS_PER_DEG_LAT
    lon = origin_lon + e / (METERS_PER_DEG_LAT * cos(origin_lat * pi / 180))
    alt = origin_alt + u
    return lat, lon, alt


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    phi1, phi2 = lat1 * pi / 180, lat2 * pi / 180
    dphi = (lat2 - lat1) * pi / 180
    dlambda = (lon2 - lon1) * pi / 180
    a = sin(dphi / 2) ** 2 + cos(phi1) * cos(phi2) * sin(dlambda / 2) ** 2
    return WGS84_A_M * 2 * atan2(sqrt(a), sqrt(1 - a))


def distance_m(a: Marker, b: Marker) -> dict[str, float]:
    horizontal_m = _haversine_m(a.lat, a.lon, b.lat, b.lon)
    e2, n2, u2 = lla_to_enu(b.lat, b.lon, b.alt_m, a.lat, a.lon, a.alt_m)
    enu_3d_m = sqrt(e2 * e2 + n2 * n2 + u2 * u2)
    return {"horizontal_m": horizontal_m, "enu_3d_m": enu_3d_m}
