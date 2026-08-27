import shutil
from datetime import datetime, timezone
from pathlib import Path

from ea.drone_id import drone_id_from_filename
from ea.manifest import load_manifest, save_manifest
from ea.store import open_experiment


def _utc_suffix() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _dest_path(dest_dir: Path, filename: str) -> Path:
    dest = dest_dir / filename
    if not dest.exists():
        return dest
    stem = Path(filename).stem
    suffix = Path(filename).suffix
    return dest_dir / f"{stem}_{_utc_suffix()}{suffix}"


def _default_drone(drone_id: int) -> dict:
    return {
        "id": drone_id,
        "label": f"D{drone_id}",
        "ssh": {"user": "pi", "host": ""},
        "sources": {
            "ulg": [],
            "system_manager": [],
            "hardware_adapter": [],
        },
    }


def _find_drone(manifest: dict, drone_id: int) -> dict | None:
    for drone in manifest.get("drones", []):
        if drone["id"] == drone_id:
            return drone
    return None


def _collect_ulog_paths(paths: list[str]) -> list[Path]:
    found: list[Path] = []
    for raw in paths:
        p = Path(raw)
        if not p.exists():
            continue
        if p.is_dir():
            for child in sorted(p.iterdir()):
                if child.is_file() and child.suffix.lower() == ".ulg":
                    found.append(child)
        elif p.is_file() and p.suffix.lower() == ".ulg":
            found.append(p)
    return found


def import_paths(slug: str, paths: list[str]) -> dict:
    result = open_experiment(slug)
    exp_path = result["path"]
    manifest = result["manifest"]
    manifest_path = exp_path / "manifest.json"

    drones_out: dict[str, dict] = {}
    needs_id: list[str] = []
    copied_any = False

    for ulg_path in _collect_ulog_paths(paths):
        drone_id = drone_id_from_filename(ulg_path.name)
        if drone_id is None:
            needs_id.append(ulg_path.name)
            continue

        drone_key = str(drone_id)
        dest_dir = exp_path / "raw" / f"drone_{drone_id}"
        try:
            dest_dir.mkdir(parents=True, exist_ok=True)
            dest = _dest_path(dest_dir, ulg_path.name)
            shutil.copy2(ulg_path, dest)
            rel = dest.relative_to(exp_path).as_posix()

            drone = _find_drone(manifest, drone_id)
            if drone is None:
                drone = _default_drone(drone_id)
                manifest.setdefault("drones", []).append(drone)

            sources = drone.setdefault("sources", {})
            ulg_list = sources.setdefault("ulg", [])
            ulg_list.append(rel)

            copied_any = True
            drones_out[drone_key] = {"ok": True}
        except OSError as e:
            drones_out[drone_key] = {"ok": False, "error": str(e)}

    save_manifest(manifest_path, manifest)

    return {
        "ok": copied_any,
        "drones": drones_out,
        "needs_id": needs_id,
    }
