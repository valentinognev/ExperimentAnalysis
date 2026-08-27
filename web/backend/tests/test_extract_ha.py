"""Tests for hardware adapter log extract."""

from pathlib import Path

import pyarrow.parquet as pq

from ea.extract_ha import extract_ha
from ea.rebuild import rebuild
from ea.store import create_experiment
from ea.topics import list_topics


def test_extract_ha_unparseable_returns_skipped_no_parquet(tmp_path):
    log = tmp_path / "20260814_adapter_diag.log"
    log.write_text("random garbage\nno timestamps here\n")
    dest = tmp_path / "derived" / "ha" / "drone_2"

    result = extract_ha(log, dest)

    assert result == "skipped"
    assert not (dest / "ha_diag.parquet").exists()
    assert not list(dest.glob("*.parquet"))


def test_extract_ha_datetime_prefixed_lines_write_parquet(tmp_path):
    log = tmp_path / "20260814_070958_mavlink.txt"
    log.write_text(
        "2026-08-14 07:09:58 HEARTBEAT {type: 2}\n"
        "2026-08-14 07:09:59 GLOBAL_POSITION_INT {lat: 1}\n"
    )
    dest = tmp_path / "derived" / "ha" / "drone_2"

    out = extract_ha(log, dest)

    assert out == dest / "ha_mavlink.parquet"
    assert out.is_file()
    df = pq.read_table(out).to_pandas()
    assert "timestamp" in df.columns
    assert "line" in df.columns
    assert len(df) == 2
    assert "HEARTBEAT" in df["line"].iloc[0]


def test_extract_ha_leading_float_timestamp_writes_parquet(tmp_path):
    log = tmp_path / "20260814_070958_adapter_diag.log"
    log.write_text(
        "# Hardware adapter diag log started 2026-08-14 07:09:58\n"
        "     2.0s pos=(0.1,0.2,-0.3) vel=(0,0,0) ts=100\n"
        "     4.1s pos=(1.0,2.0,-3.0) vel=(0.1,0,0) ts=200\n"
    )
    dest = tmp_path / "derived" / "ha" / "drone_2"

    out = extract_ha(log, dest)

    assert out == dest / "ha_diag.parquet"
    assert out.is_file()
    df = pq.read_table(out).to_pandas()
    assert len(df) == 2
    assert df["timestamp"].iloc[0] == 2.0
    assert "pos=(0.1,0.2,-0.3)" in df["line"].iloc[0]


def test_rebuild_skipped_ha_not_in_topics(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    created = create_experiment("HA Rebuild")
    slug = created["slug"]
    exp_path = created["path"]

    raw_drone = exp_path / "raw" / "drone_2"
    raw_drone.mkdir(parents=True)
    (raw_drone / "20260814_adapter_diag.log").write_text("unparseable noise\n")
    (raw_drone / "20260814_mavlink.txt").write_text(
        "2026-08-14 07:09:58 HEARTBEAT {}\n"
    )

    result = rebuild(slug)

    ha_notes = result["drones"]["2"]["ha_extract"]
    assert len(ha_notes) == 2
    skipped = [n for n in ha_notes if n.get("status") == "skipped"]
    extracted = [n for n in ha_notes if "parquet" in n]
    assert len(skipped) == 1
    assert len(extracted) == 1
    assert extracted[0]["parquet"] == "ha_mavlink.parquet"

    tree = list_topics(exp_path)
    assert "ha" in tree["2"]
    assert "ha_mavlink" in tree["2"]["ha"]
    assert "ha_diag" not in tree["2"]["ha"]
