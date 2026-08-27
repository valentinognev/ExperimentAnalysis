"""WGS84 spherical geo helpers (matches Observation Board geo.ts)."""

from math import cos, pi

WGS84_A_M = 6378137
METERS_PER_DEG_LAT = WGS84_A_M * pi / 180


def lla_to_enu(
    lat: float,
    lon: float,
    alt: float,
    origin_lat: float,
    origin_lon: float,
    origin_alt: float,
) -> tuple[float, float, float]:
    n = (lat - origin_lat) * METERS_PER_DEG_LAT
    e = (
        (lon - origin_lon)
        * METERS_PER_DEG_LAT
        * cos(origin_lat * pi / 180)
    )
    u = alt - origin_alt
    return e, n, u


def ned_to_enu(n: float, e: float, d: float) -> tuple[float, float, float]:
    return e, n, -d


def mean_origin(llas: list[tuple[float, float, float]]) -> tuple[float, float, float]:
    if not llas:
        raise ValueError("llas must not be empty")
    n = len(llas)
    lat = sum(lla[0] for lla in llas) / n
    lon = sum(lla[1] for lla in llas) / n
    alt = sum(lla[2] for lla in llas) / n
    return lat, lon, alt
