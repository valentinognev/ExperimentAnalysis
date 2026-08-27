from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def test_gitignore_excludes_experiments():
    text = (ROOT / ".gitignore").read_text()
    assert "experiments/" in text
    assert "node_modules/" in text
    assert ".env" in text


def test_readme_and_updates_exist():
    readme = (ROOT / "README.md").read_text()
    updates = (ROOT / "UPDATES.md").read_text()
    assert "ExperimentAnalysis" in readme
    assert "UPDATES.md" in readme
    assert "## 0.1.0" in updates
