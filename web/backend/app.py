import copy

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from ea.ingest_files import import_paths
from ea.ingest_mavlink import mavlink_pull
from ea.ingest_ssh import _redact_password, ssh_pull
from ea.manifest import merge_manifest, save_manifest
from ea.pose import pose_at
from ea.duration import experiment_t_max_s
from ea.rebuild import rebuild
from ea.series import series
from ea.topics import list_topics
from ea.store import create_experiment, list_experiments, open_experiment
from ports import FRONTEND_PORT


def _manifest_for_api(manifest: dict) -> dict:
    redacted = copy.deepcopy(manifest)
    for drone in redacted.get("drones", []):
        ssh = drone.get("ssh")
        if isinstance(ssh, dict) and "password" in ssh:
            del ssh["password"]
    return redacted

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[f"http://127.0.0.1:{FRONTEND_PORT}"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class CreateExperimentBody(BaseModel):
    name: str


class ImportBody(BaseModel):
    paths: list[str]
    assignments: dict[str, int] | None = None


class PullBody(BaseModel):
    drone_id: int
    adapters: list[str]


class MarkerBody(BaseModel):
    id: str
    label: str
    lat: float
    lon: float
    alt_m: float


class MarkersBody(BaseModel):
    markers: list[MarkerBody]


@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/experiments")
def get_experiments():
    return list_experiments()


@app.post("/api/experiments")
def post_experiment(body: CreateExperimentBody):
    try:
        result = create_experiment(body.name)
    except FileExistsError:
        raise HTTPException(status_code=409, detail="experiment already exists")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"slug": result["slug"], "manifest": result["manifest"]}


@app.get("/api/experiments/{slug}")
def get_experiment(slug: str):
    try:
        result = open_experiment(slug)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="experiment not found")
    return {"slug": result["slug"], "manifest": _manifest_for_api(result["manifest"])}


@app.post("/api/experiments/{slug}/import")
def post_import(slug: str, body: ImportBody):
    try:
        return import_paths(slug, body.paths, body.assignments)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="experiment not found")


@app.post("/api/experiments/{slug}/pull")
def post_pull(slug: str, body: PullBody):
    try:
        result = open_experiment(slug)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="experiment not found")

    password = None
    for drone in result["manifest"].get("drones", []):
        if drone["id"] == body.drone_id:
            password = drone.get("ssh", {}).get("password")
            break

    drone_key = str(body.drone_id)
    any_ok = False
    last_error = None

    for adapter in body.adapters:
        if adapter == "ssh":
            pull_result = ssh_pull(slug, body.drone_id)
        elif adapter == "mavlink":
            pull_result = mavlink_pull(slug, body.drone_id)
        else:
            last_error = f"unknown adapter: {adapter}"
            continue

        if pull_result.get("ok"):
            any_ok = True
        else:
            err = pull_result.get("error", "pull failed")
            last_error = _redact_password(err, password)

    if any_ok:
        rebuild(slug)
        drones_out = {drone_key: {"ok": True}}
    else:
        drones_out = {
            drone_key: {"ok": False, "error": last_error or "pull failed"},
        }

    return {"ok": any_ok, "drones": drones_out}


@app.patch("/api/experiments/{slug}/manifest")
def patch_manifest(slug: str, patch: dict):
    try:
        result = open_experiment(slug)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="experiment not found")
    merged = merge_manifest(result["manifest"], patch)
    save_manifest(result["path"] / "manifest.json", merged)
    return {"slug": slug, "manifest": merged}


@app.patch("/api/experiments/{slug}/markers")
def patch_markers(slug: str, body: MarkersBody):
    try:
        result = open_experiment(slug)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="experiment not found")
    markers = [m.model_dump() for m in body.markers]
    merged = merge_manifest(result["manifest"], {"ui": {"markers": markers}})
    save_manifest(result["path"] / "manifest.json", merged)
    return {"slug": slug, "manifest": merged}


@app.get("/api/experiments/{slug}/duration")
def get_duration(slug: str):
    try:
        result = open_experiment(slug)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="experiment not found")
    return {"t_max_s": experiment_t_max_s(result["path"])}


@app.post("/api/experiments/{slug}/rebuild")
def post_rebuild(slug: str):
    try:
        return rebuild(slug)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="experiment not found")


@app.get("/api/experiments/{slug}/pose")
def get_pose(slug: str, t: float = 0.0):
    try:
        result = open_experiment(slug)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="experiment not found")
    return pose_at(result["path"], t)


@app.get("/api/experiments/{slug}/series")
def get_series(
    slug: str,
    channels: list[str] = Query(...),
    t0: float | None = None,
    t1: float | None = None,
):
    try:
        result = open_experiment(slug)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="experiment not found")
    return series(result["path"], channels, t0=t0, t1=t1)


@app.get("/api/experiments/{slug}/topics")
def get_topics(slug: str):
    try:
        result = open_experiment(slug)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="experiment not found")
    return list_topics(result["path"])
