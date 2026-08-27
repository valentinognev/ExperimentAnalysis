from fastapi.testclient import TestClient

from app import app


def test_patch_ui_plots_roundtrip(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    c = TestClient(app)

    r = c.post("/api/experiments", json={"name": "PlotPersist"})
    assert r.status_code == 200
    slug = r.json()["slug"]

    plots = [
        {
            "id": "plot-1",
            "channels": ["2.ulog.vehicle_local_position.x"],
        }
    ]
    r = c.patch(
        f"/api/experiments/{slug}/manifest",
        json={"ui": {"plots": plots, "visible_drone_ids": [2, 3]}},
    )
    assert r.status_code == 200
    assert r.json()["manifest"]["ui"]["plots"] == plots
    assert r.json()["manifest"]["ui"]["visible_drone_ids"] == [2, 3]

    r = c.get(f"/api/experiments/{slug}")
    assert r.status_code == 200
    ui = r.json()["manifest"]["ui"]
    assert ui["plots"] == plots
    assert ui["visible_drone_ids"] == [2, 3]
