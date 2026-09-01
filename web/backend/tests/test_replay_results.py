from ea.replay.results import find_newest_replayed, collect_results


def test_find_newest(tmp_path):
    d1 = tmp_path / "2026-01-01"
    d2 = tmp_path / "2026-01-02"
    d1.mkdir(); d2.mkdir()
    a = d1 / "log_replayed.ulg"
    b = d2 / "log_replayed.ulg"
    a.write_bytes(b"a")
    b.write_bytes(b"b")
    import os
    os.utime(a, (1, 1))
    os.utime(b, (2, 2))
    assert find_newest_replayed(tmp_path) == b


def test_collect_success(tmp_path):
    log_root = tmp_path / "log"
    log_root.mkdir()
    src = log_root / "flight_replayed.ulg"
    src.write_bytes(b"ulg")
    results = tmp_path / "results"
    out = collect_results("r1", log_root, results, "hello\n")
    assert out["ok"] is True
    dest = results / "r1" / "flight_replayed.ulg"
    assert dest.read_bytes() == b"ulg"
    assert (results / "r1" / "px4.log").read_text() == "hello\n"


def test_find_newest_ignores_mtime_before_since(tmp_path):
    d1 = tmp_path / "2026-01-01"
    d1.mkdir()
    old = d1 / "old_replayed.ulg"
    new = d1 / "new_replayed.ulg"
    old.write_bytes(b"old")
    new.write_bytes(b"new")
    import os

    os.utime(old, (1, 1))
    os.utime(new, (100, 100))
    assert find_newest_replayed(tmp_path, since=50) == new
    assert find_newest_replayed(tmp_path, since=150) is None


def test_collect_missing_replayed(tmp_path):
    log_root = tmp_path / "log"
    log_root.mkdir()
    results = tmp_path / "results"
    out = collect_results("r1", log_root, results, "fail\n")
    assert out["ok"] is False
    assert out["replayed_ulg"] is None
    assert (results / "r1" / "px4.log").read_text() == "fail\n"
    assert list((results / "r1").glob("*.ulg")) == []
