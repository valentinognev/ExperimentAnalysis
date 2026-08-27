from ea.manifest import empty_manifest, load_manifest, save_manifest
from ea.slug import slugify
from paths import experiments_dir


def create_experiment(name: str) -> dict:
    slug = slugify(name)
    path = experiments_dir() / slug
    if path.exists():
        raise FileExistsError(f"experiment already exists: {slug}")
    path.mkdir(parents=True)
    (path / "raw").mkdir()
    (path / "derived").mkdir()
    manifest = empty_manifest(name)
    save_manifest(path / "manifest.json", manifest)
    return {"slug": slug, "path": path, "manifest": manifest}


def _drone_ids_and_missing(manifest: dict) -> tuple[list, list]:
    drone_ids = []
    missing = []
    for drone in manifest.get("drones", []):
        drone_id = drone["id"]
        drone_ids.append(drone_id)
        ulg = drone.get("sources", {}).get("ulg", [])
        if not ulg:
            missing.append(drone_id)
    return drone_ids, missing


def list_experiments() -> list[dict]:
    root = experiments_dir()
    if not root.is_dir():
        return []
    results = []
    for entry in sorted(root.iterdir()):
        if not entry.is_dir():
            continue
        manifest_path = entry / "manifest.json"
        if not manifest_path.is_file():
            continue
        manifest = load_manifest(manifest_path)
        drone_ids, missing = _drone_ids_and_missing(manifest)
        results.append({
            "slug": entry.name,
            "name": manifest["name"],
            "drone_ids": drone_ids,
            "missing": missing,
        })
    return results


def open_experiment(slug: str) -> dict:
    path = experiments_dir() / slug
    manifest_path = path / "manifest.json"
    if not manifest_path.is_file():
        raise FileNotFoundError(f"experiment not found: {slug}")
    manifest = load_manifest(manifest_path)
    return {"slug": slug, "path": path, "manifest": manifest}
