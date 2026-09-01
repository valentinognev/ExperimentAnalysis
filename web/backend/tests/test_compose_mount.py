from pathlib import Path

COMPOSE = Path("/home/valentin/Projects/GambitonBiut/dockerfiles_firm/compose.yaml")

_BIND = (
    "/home/valentin/RL/CatSwarm/ExperimentAnalysis:/home/valentin/ExperimentAnalysis"
)


def test_experiment_analysis_bind_mount():
    text = COMPOSE.read_text()
    assert _BIND in text
    assert "/home/valentin/RL/PX4Replay:/home/valentin/PX4Replay" not in text
    assert "matek_h743-slim_default" not in text
