import shutil
import subprocess


def pick_directory(runner=subprocess.run, which=shutil.which) -> str | None:
    if which("zenity"):
        cmd = ["zenity", "--file-selection", "--directory"]
    elif which("kdialog"):
        cmd = ["kdialog", "--getexistingdirectory"]
    else:
        raise FileNotFoundError("no folder dialog (kdialog or zenity)")
    proc = runner(cmd, capture_output=True, text=True)
    if proc.returncode != 0 or not (proc.stdout or "").strip():
        return None
    return proc.stdout.strip()
