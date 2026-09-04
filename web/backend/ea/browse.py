import json
import os
import shutil
import subprocess
from pathlib import Path

DEFAULT_RECENTS_FILE = (
    Path.home() / ".local" / "state" / "experiment-analysis" / "browse-recent.json"
)
MAX_RECENTS = 8

_UNSET = object()


def start_dir(path: str | None) -> str | None:
    if path is None:
        return None
    raw = path.strip()
    if not raw:
        return None
    p = Path(raw)
    if p.is_dir():
        return str(p)
    parent = p.parent
    if parent.is_dir():
        return str(parent)
    return None


def recent_path(recents_file=None) -> Path:
    """Where the remembered-folders list lives.

    Explicit `recents_file` wins, then `EA_BROWSE_RECENT`, then the
    operator's real state dir.
    """
    if recents_file is not None:
        return Path(recents_file)
    env = os.environ.get("EA_BROWSE_RECENT")
    if env:
        return Path(env)
    return DEFAULT_RECENTS_FILE


def load_recents(recents_file=None) -> list[str]:
    path = recent_path(recents_file)
    try:
        raw = path.read_text()
    except OSError:
        return []
    try:
        data = json.loads(raw)
    except ValueError:
        return []
    if not isinstance(data, list):
        return []
    return [p for p in data if isinstance(p, str)]


def save_recents(recents: list[str], recents_file=None) -> None:
    path = recent_path(recents_file)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(recents))


def remember_folder(folder: str, recents_file=None) -> list[str]:
    recents = load_recents(recents_file)
    recents = [r for r in recents if r != folder]
    recents.insert(0, folder)
    recents = recents[:MAX_RECENTS]
    save_recents(recents, recents_file)
    return recents


def resolve_start_folder(
    start: str | None = None,
    recents: list[str] | None = None,
    recents_file=None,
) -> str | None:
    """Start folder for the chooser: explicit `start` wins, else the
    newest still-existing recent folder, else None (dialog's own default).
    """
    folder = start_dir(start)
    if folder:
        return folder
    if recents is None:
        recents = load_recents(recents_file)
    for r in recents:
        if r and Path(r).is_dir():
            return r
    return None


def resolve_typed_path(text: str | None) -> tuple[str, str] | None:
    """Classify a pasted path: ("dir", path), ("file", path), or None."""
    if not text:
        return None
    raw = text.strip()
    if not raw:
        return None
    p = Path(raw).expanduser()
    if p.is_dir():
        return ("dir", str(p))
    if p.is_file():
        return ("file", str(p))
    return None


def gtk_python() -> str | None:
    """A system python3 with PyGObject (gi) + Gtk 3.0, or None.

    The project venv intentionally does not have `gi` installed, so this
    probes system interpreters as external processes rather than
    importing gi in-process.
    """
    candidates = []
    if Path("/usr/bin/python3").exists():
        candidates.append("/usr/bin/python3")
    found = shutil.which("python3")
    if found and found not in candidates:
        candidates.append(found)

    probe = "import gi; gi.require_version('Gtk', '3.0'); from gi.repository import Gtk"
    for candidate in candidates:
        try:
            proc = subprocess.run(
                [candidate, "-c", probe],
                capture_output=True,
                text=True,
                timeout=5,
            )
        except (OSError, subprocess.TimeoutExpired):
            continue
        if proc.returncode == 0:
            return candidate
    return None


def _run_gtk(python_bin, folder, recents, gtk_runner):
    backend_dir = Path(__file__).resolve().parent.parent
    cmd = [python_bin, "-m", "ea.browse_gtk"]
    if folder:
        cmd += ["--start", folder]
    for r in recents:
        if r and Path(r).is_dir():
            cmd += ["--recent", r]
    try:
        proc = gtk_runner(cmd, capture_output=True, text=True, cwd=str(backend_dir))
    except OSError:
        return None
    if proc.returncode != 0 or not (proc.stdout or "").strip():
        return None
    return proc.stdout.strip()


def pick_file(
    runner=subprocess.run,
    which=shutil.which,
    start: str | None = None,
    recents_file=None,
    gtk_python=_UNSET,
    gtk_runner=subprocess.run,
) -> str | None:
    recents = load_recents(recents_file)
    folder = resolve_start_folder(start, recents=recents)

    prober = gtk_python
    if prober is _UNSET:
        prober = globals()["gtk_python"]
    python_bin = prober() if prober is not None else None

    if python_bin:
        result = _run_gtk(python_bin, folder, recents, gtk_runner)
        if result:
            remember_folder(str(Path(result).parent), recents_file)
            return result
        # fall through to zenity/kdialog below

    if which("zenity"):
        cmd = ["zenity", "--file-selection"]
        if folder:
            cmd.append(f"--filename={folder}/")
    elif which("kdialog"):
        cmd = ["kdialog", "--getopenfilename"]
        if folder:
            cmd.append(folder)
    else:
        raise FileNotFoundError("no file dialog (kdialog or zenity)")
    proc = runner(cmd, capture_output=True, text=True)
    if proc.returncode != 0 or not (proc.stdout or "").strip():
        return None
    result = proc.stdout.strip()
    remember_folder(str(Path(result).parent), recents_file)
    return result
