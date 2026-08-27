from ea.manifest import empty_manifest, save_manifest, load_manifest, merge_manifest


def test_roundtrip(tmp_path):
    m = empty_manifest("Baseball")
    assert m["version"] == 1
    assert m["name"] == "Baseball"
    assert m["drones"] == []
    assert m["sync"]["mode"] == "arm"
    assert m["ui"]["engine3d"] == "plotly"
    p = tmp_path / "manifest.json"
    save_manifest(p, m)
    loaded = load_manifest(p)
    assert loaded["name"] == "Baseball"


def test_merge_ui_keeps_sources():
    m = empty_manifest("X")
    m["drones"] = [{
        "id": 2,
        "label": "D2",
        "ssh": {"user": "pi", "host": "192.168.31.30"},
        "mavlink": {"url": "tcp:192.168.31.30:5760"},
        "sources": {"ulg": ["raw/drone_2/a.ulg"], "system_manager": [], "hardware_adapter": []},
    }]
    merged = merge_manifest(m, {"ui": {"visible_drone_ids": [2, 3, 4]}})
    assert merged["drones"][0]["sources"]["ulg"] == ["raw/drone_2/a.ulg"]
    assert merged["ui"]["visible_drone_ids"] == [2, 3, 4]
