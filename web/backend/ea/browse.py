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
    except (OSError, ValueError):
        # ValueError covers UnicodeDecodeError from a binary/non-UTF-8 file.
        return []
    try:
        data = json.loads(raw)
    except ValueError:
        return []
    if not isinstance(data, dict):
        return []
    folders = data.get("folders")
    if not isinstance(folders, list):
        return []
    return [p for p in folders if isinstance(p, str)]


def save_recents(recents: list[str], recents_file=None) -> None:
    path = recent_path(recents_file)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"folders": recents}))


def remember_folder(folder: str, recents_file=None) -> list[str]:
    if not folder or not Path(folder).is_dir():
        # Junk (missing paths, files) must not occupy the 8 recent slots.
        return load_recents(recents_file)
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


# Sentinel distinguishing "GTK failed, fall back to zenity/kdialog" from a
# real (if falsy) return value. Cancel is represented by `None` and must
# NOT trigger a fallback dialog.
_GTK_FAILED = object()


def _run_gtk(python_bin, folder, recents, gtk_runner):
    """Run the GTK chooser subprocess.

    Three-way exit code contract with `ea/browse_gtk.py`:
    0 = picked (stdout has the path), 1 = cancelled, 2 = failed.
    Returns the picked path, `None` on cancel, or `_GTK_FAILED` on failure
    (subprocess launch error, or exit code other than 0/1).
    """
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
        return _GTK_FAILED
    if proc.returncode == 0:
        stdout = (proc.stdout or "").strip()
        return stdout if stdout else _GTK_FAILED
    if proc.returncode == 1:
        return None
    return _GTK_FAILED


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
        if result is _GTK_FAILED:
            pass  # fall through to zenity/kdialog below
        elif result is None:
            # GTK cancel: return None immediately, no fallback dialog,
            # no recents write (controller ruling).
            return None
        else:
            remember_folder(str(Path(result).parent), recents_file)
            return result

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
