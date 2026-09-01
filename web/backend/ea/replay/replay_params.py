from pathlib import Path


def write_replay_params(path: Path, overrides: dict[str, float | int | str]) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    if not overrides:
        path.write_bytes(b"")
        return
    lines = [f"{name} {overrides[name]}\n" for name in sorted(overrides)]
    path.write_text("".join(lines), encoding="utf-8")
