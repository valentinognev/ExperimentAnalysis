from ea.drone_id import drone_id_from_filename


def test_group3rlcat():
    assert drone_id_from_filename(
        "Group3RLcat3_log_18_2026-8-25-17-05-26.ulg"
    ) == 3
    assert drone_id_from_filename(
        "Group3RLcat2_log_41_2026-8-25-17-05-30.ulg"
    ) == 2
    assert drone_id_from_filename(
        "Group3RLcat4_log_28_2026-8-25-17-05-24.ulg"
    ) == 4


def test_sm_suffix():
    assert drone_id_from_filename("20260814_070958_system_manager_d2.csv") == 2


def test_needs_id():
    assert drone_id_from_filename("random.ulg") is None
