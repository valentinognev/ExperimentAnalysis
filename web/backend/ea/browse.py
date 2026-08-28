import shutil
import subprocess
from pathlib import Path


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


def pick_file(
    runner=subprocess.run,
    which=shutil.which,
    start: str | None = None,
) -> str | None:
    folder = start_dir(start)
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
    return proc.stdout.strip()
