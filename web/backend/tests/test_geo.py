import math

import pytest

from ea.geo import (
    METERS_PER_DEG_LAT,
    WGS84_A_M,
    lla_to_enu,
    mean_origin,
    ned_to_enu,
)


def test_wgs84_constants():
    assert WGS84_A_M == 6378137
    assert METERS_PER_DEG_LAT == pytest.approx(WGS84_A_M * math.pi / 180)


def test_lla_to_enu_one_meter_north():
    origin_lat, origin_lon, origin_alt = 32.08, 34.78, 50.0
    lat = origin_lat + 1.0 / METERS_PER_DEG_LAT
    e, n, u = lla_to_enu(lat, origin_lon, origin_alt, origin_lat, origin_lon, origin_alt)
    assert n == pytest.approx(1.0, abs=1e-6)
    assert e == pytest.approx(0.0, abs=1e-6)
    assert u == pytest.approx(0.0, abs=1e-6)


def test_ned_to_enu():
    assert ned_to_enu(1, 2, 3) == (2, 1, -3)


def test_mean_origin():
    llas = [(32.0, 34.0, 10.0), (34.0, 36.0, 20.0)]
    assert mean_origin(llas) == (33.0, 35.0, 15.0)


def test_mean_origin_empty_raises():
    with pytest.raises(ValueError):
        mean_origin([])
