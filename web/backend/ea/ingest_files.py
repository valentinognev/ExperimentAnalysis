import shutil
from datetime import datetime, timezone
from pathlib import Path

from ea.drone_id import drone_id_from_filename
from ea.ingest_ssh import _update_manifest_sources
from ea.manifest import save_manifest
from ea.store import default_drone, open_experiment


def _utc_suffix() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _dest_path(dest_dir: Path, filename: str) -> Path:
    dest = dest_dir / filename
    if not dest.exists():
        return dest
    stem = Path(filename).stem
    suffix = Path(filename).suffix
    return dest_dir / f"{stem}_{_utc_suffix()}{suffix}"


def _find_drone(manifest: dict, drone_id: int) -> dict | None:
    for drone in manifest.get("drones", []):
        if drone["id"] == drone_id:
            return drone
    return None


def _is_sm_csv(path: Path) -> bool:
    return path.suffix.lower() == ".csv" and "system_manager" in path.name.lower()


def _is_ha_file(path: Path) -> bool:
    name = path.name.lower()
    if "adapter_diag" in name and name.endswith(".log"):
        return True
    if "mavlink" in name and name.endswith((".txt", ".log")):
        return True
    return False


def _file_kind(path: Path) -> str | None:
    if path.suffix.lower() == ".ulg":
        return "ulg"
    if _is_sm_csv(path):
        return "sm"
    if _is_ha_file(path):
        return "ha"
    return None


def _collect_import_files(paths: list[str]) -> list[tuple[Path, bool]]:
    found: list[tuple[Path, bool]] = []
    for raw in paths:
        p = Path(raw)
        if not p.exists():
            continue
        if p.is_dir():
            for child in sorted(p.iterdir()):
                if child.is_file() and _file_kind(child):
                    found.append((child, True))
        elif p.is_file() and _file_kind(p):
            found.append((p, False))
    return found


def _resolve_drone_id(
    filename: str,
    assignments: dict[str, int],
) -> int | None:
    drone_id = drone_id_from_filename(filename)
    if drone_id is not None:
        return drone_id
    return assignments.get(filename)


def _needs_pick_drones(candidates: list[tuple[Path, int, bool, str]]) -> set[int]:
    sm_from_dir: dict[int, int] = {}
    ha_from_dir: dict[int, int] = {}
    for _path, resolved_id, from_dir, kind in candidates:
        if not from_dir:
            continue
        if kind == "sm":
            sm_from_dir[resolved_id] = sm_from_dir.get(resolved_id, 0) + 1
        elif kind == "ha":
            ha_from_dir[resolved_id] = ha_from_dir.get(resolved_id, 0) + 1
    defer: set[int] = set()
    for drone, n in sm_from_dir.items():
        if n > 1:
            defer.add(drone)
    for drone, n in ha_from_dir.items():
        if n > 2:
            defer.add(drone)
    return defer


def import_paths(
    slug: str,
    paths: list[str],
    assignments: dict[str, int] | None = None,
    drone_id: int | None = None,
) -> dict:
    result = open_experiment(slug)
    exp_path = result["path"]
    manifest = result["manifest"]
    manifest_path = exp_path / "manifest.json"

    assignments = assignments or {}
    drones_out: dict[str, dict] = {}
    needs_id: list[str] = []
    copied_any = False
    drones_touched: set[int] = set()
    copied_dests: dict[int, list[Path]] = {}

    candidates: list[tuple[Path, int, bool, str]] = []
    for file_path, from_dir in _collect_import_files(paths):
        kind = _file_kind(file_path)
        if kind is None:
            continue
        if drone_id is not None:
            filename_id = drone_id_from_filename(file_path.name)
            if filename_id is not None and filename_id != drone_id:
                continue
            resolved_id = drone_id
        else:
            resolved_id = _resolve_drone_id(file_path.name, assignments)
            if resolved_id is None:
                needs_id.append(file_path.name)
                continue
        candidates.append((file_path, resolved_id, from_dir, kind))

    defer = _needs_pick_drones(candidates)
    needs_pick: list[dict] = []

    for file_path, resolved_id, from_dir, kind in candidates:
        if from_dir and resolved_id in defer and kind in ("sm", "ha"):
            needs_pick.append(
                {
                    "path": str(file_path.resolve()),
                    "name": file_path.name,
                    "kind": kind,
                    "size": file_path.stat().st_size,
                }
            )
            continue

        drone_key = str(resolved_id)
        dest_dir = exp_path / "raw" / f"drone_{resolved_id}"
        try:
            dest_dir.mkdir(parents=True, exist_ok=True)
            dest = _dest_path(dest_dir, file_path.name)
            shutil.copy2(file_path, dest)
            rel = dest.relative_to(exp_path).as_posix()

            drone = _find_drone(manifest, resolved_id)
            if drone is None:
                drone = default_drone(resolved_id)
                manifest.setdefault("drones", []).append(drone)

            sources = drone.setdefault("sources", {})
            if kind == "ulg":
                ulg_list = sources.setdefault("ulg", [])
                ulg_list.append(rel)
                sources["ulg_origin"] = str(file_path.resolve())

            copied_any = True
            drones_touched.add(resolved_id)
            copied_dests.setdefault(resolved_id, []).append(dest)
            drones_out[drone_key] = {"ok": True}
        except OSError as e:
            drones_out[drone_key] = {"ok": False, "error": str(e)}

    for touched_id in drones_touched:
        dest_dir = exp_path / "raw" / f"drone_{touched_id}"
        _update_manifest_sources(
            manifest,
            touched_id,
            exp_path,
            dest_dir,
            copied_paths=copied_dests.get(touched_id),
        )

    save_manifest(manifest_path, manifest)

    return {
        "ok": copied_any,
        "drones": drones_out,
        "needs_id": needs_id,
        "needs_pick": needs_pick,
    }
