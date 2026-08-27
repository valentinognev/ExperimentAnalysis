import math

import pytest
from fastapi.testclient import TestClient

from app import app
from ea.geo import METERS_PER_DEG_LAT, lla_to_enu
from ea.markers import Marker, distance_m, enu_to_lla

ORIGIN_LAT, ORIGIN_LON, ORIGIN_ALT = 32.08, 34.78, 50.0


def test_one_meter_north_horizontal_distance():
  lat_north, lon_north, alt_north = enu_to_lla(
      0.0, 1.0, 0.0, ORIGIN_LAT, ORIGIN_LON, ORIGIN_ALT
  )
  a = Marker(id="a", label="origin", lat=ORIGIN_LAT, lon=ORIGIN_LON, alt_m=ORIGIN_ALT)
  b = Marker(id="b", label="north", lat=lat_north, lon=lon_north, alt_m=alt_north)
  d = distance_m(a, b)
  assert d["horizontal_m"] == pytest.approx(1.0, abs=0.01)
  assert d["enu_3d_m"] == pytest.approx(1.0, abs=0.01)


def test_enu_to_lla_roundtrip():
  lat, lon, alt = 32.081, 34.782, 53.5
  e, n, u = lla_to_enu(lat, lon, alt, ORIGIN_LAT, ORIGIN_LON, ORIGIN_ALT)
  lat2, lon2, alt2 = enu_to_lla(e, n, u, ORIGIN_LAT, ORIGIN_LON, ORIGIN_ALT)
  assert lat2 == pytest.approx(lat, abs=1e-9)
  assert lon2 == pytest.approx(lon, abs=1e-9)
  assert alt2 == pytest.approx(alt, abs=1e-6)


def test_patch_markers_roundtrip(tmp_path, monkeypatch):
  monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
  c = TestClient(app)

  r = c.post("/api/experiments", json={"name": "Markers"})
  assert r.status_code == 200
  slug = r.json()["slug"]

  markers = [
      {
          "id": "m1",
          "label": "A",
          "lat": ORIGIN_LAT,
          "lon": ORIGIN_LON,
          "alt_m": ORIGIN_ALT,
      },
      {
          "id": "m2",
          "label": "B",
          "lat": ORIGIN_LAT + 1.0 / METERS_PER_DEG_LAT,
          "lon": ORIGIN_LON,
          "alt_m": ORIGIN_ALT,
      },
  ]
  r = c.patch(f"/api/experiments/{slug}/markers", json={"markers": markers})
  assert r.status_code == 200
  assert r.json()["manifest"]["ui"]["markers"] == markers

  r = c.get(f"/api/experiments/{slug}")
  assert r.status_code == 200
  assert r.json()["manifest"]["ui"]["markers"] == markers


def test_distance_altitude_delta_enu_3d():
  a = Marker(id="a", label="low", lat=ORIGIN_LAT, lon=ORIGIN_LON, alt_m=ORIGIN_ALT)
  b = Marker(id="b", label="high", lat=ORIGIN_LAT, lon=ORIGIN_LON, alt_m=ORIGIN_ALT + 3.0)
  d = distance_m(a, b)
  assert d["horizontal_m"] == pytest.approx(0.0, abs=0.01)
  assert d["enu_3d_m"] == pytest.approx(3.0, abs=0.01)
