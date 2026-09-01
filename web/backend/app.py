import copy
import threading
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from ea.browse import pick_file
from ea.ingest_files import import_paths
from ea.ingest_mavlink import (
    mavlink_download_events,
    mavlink_download_log,
    mavlink_list_logs,
    mavlink_pull,
)
from ea.ingest_ssh import _redact_password, ssh_copy_events, ssh_copy_logs, ssh_list_logs, ssh_pull
from ea.transfer_stream import ndjson_stream
from ea.manifest import merge_manifest, save_manifest
from ea.pose import pose_at
from ea.replay.overlay_series import overlay_series
from ea.replay.paths import host_px4_root, host_replay_params_path
from ea.replay.replay_job import (
    BusyError,
    claim_busy,
    get_job,
    is_busy,
    release_busy,
    request_stop,
    start_replay,
)
from ea.replay.work_staging import container_ulg_path, inspect_and_stage
from ea.replay_id import is_replay_id, physical_id
from ea.trajectory import trajectory
from ea.duration import experiment_t_max_s
from ea.rebuild import rebuild
from ea.series import series
from ea.topics import list_topics
from ea.store import (
    add_drone,
    create_experiment,
    delete_replay_drone,
    list_experiments,
    open_experiment,
    set_drone_count,
)
from ports import FRONTEND_PORT


def _manifest_for_api(manifest: dict) -> dict:
    redacted = copy.deepcopy(manifest)
    for drone in redacted.get("drones", []):
        ssh = drone.get("ssh")
        if isinstance(ssh, dict) and "password" in ssh:
            del ssh["password"]
    return redacted


def _reject_replay_drone(drone_id) -> None:
    if drone_id is not None and is_replay_id(drone_id):
        raise HTTPException(status_code=400, detail="replay id not allowed")


def _open_or_404(slug: str) -> dict:
    try:
        return open_experiment(slug)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="experiment not found")


def _physical_ulog(exp_path: Path, manifest: dict, drone_id) -> tuple[Path, int]:
    _reject_replay_drone(drone_id)
    pid = physical_id(drone_id)
    if pid is None:
        raise HTTPException(status_code=400, detail="missing ulog")
    drone = next((d for d in manifest.get("drones", []) if d["id"] == pid), None)
    ulgs = (drone or {}).get("sources", {}).get("ulg") or []
    if not ulgs:
        raise HTTPException(status_code=400, detail="missing ulog")
    raw = Path(ulgs[0])
    ulog_path = raw if raw.is_absolute() else exp_path / raw
    if not ulog_path.is_file():
        raise HTTPException(status_code=400, detail="missing ulog")
    return ulog_path, pid


def _sitl_log_root() -> Path:
    return host_px4_root() / "build/px4_sitl_default_replay/rootfs/fs/microsd/log"

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
    drone_id: int | str | None = None


class BrowseFileBody(BaseModel):
    start: str | None = None


class AddDroneBody(BaseModel):
    id: int


class SetDroneCountBody(BaseModel):
    count: int


class PullBody(BaseModel):
    drone_id: int | str
    adapters: list[str]


class MavlinkListBody(BaseModel):
    drone_id: int | str
    transport: str = "tcp"
    serial: str | None = None


class MavlinkDownloadBody(BaseModel):
    drone_id: int | str
    log_id: int
    transport: str = "tcp"
    serial: str | None = None
    confirm_replace: bool = False


class SshListBody(BaseModel):
    drone_id: int | str


class SshCopyFile(BaseModel):
    remote: str
    name: str
    size: int | None = None


class SshCopyBody(BaseModel):
    drone_id: int | str
    files: list[SshCopyFile]


class ReplayInspectBody(BaseModel):
    drone_id: int | str


class ReplayStartBody(BaseModel):
    run_id: str
    drone_id: int | str
    overrides: dict


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


@app.post("/api/browse-file")
def post_browse_file(body: BrowseFileBody | None = None):
    start = body.start if body is not None else None
    try:
        result = pick_file(start=start)
    except FileNotFoundError as e:
        raise HTTPException(status_code=503, detail=str(e))
    return {"path": result}


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
    _open_or_404(slug)
    _reject_replay_drone(body.drone_id)
    try:
        return import_paths(slug, body.paths, body.assignments, drone_id=body.drone_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="experiment not found")


@app.post("/api/experiments/{slug}/drones")
def post_add_drone(slug: str, body: AddDroneBody):
    try:
        result = add_drone(slug, body.id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="experiment not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"slug": result["slug"], "manifest": _manifest_for_api(result["manifest"])}


@app.put("/api/experiments/{slug}/drones")
def put_drone_count(slug: str, body: SetDroneCountBody):
    try:
        result = set_drone_count(slug, body.count)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="experiment not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"slug": result["slug"], "manifest": _manifest_for_api(result["manifest"])}


@app.post("/api/experiments/{slug}/pull")
def post_pull(slug: str, body: PullBody):
    result = _open_or_404(slug)
    _reject_replay_drone(body.drone_id)

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


@app.post("/api/experiments/{slug}/mavlink/logs")
def post_mavlink_logs(slug: str, body: MavlinkListBody):
    _open_or_404(slug)
    _reject_replay_drone(body.drone_id)
    return mavlink_list_logs(
        slug, body.drone_id, transport=body.transport, serial=body.serial
    )


@app.post("/api/experiments/{slug}/mavlink/download")
async def post_mavlink_download(slug: str, body: MavlinkDownloadBody, request: Request):
    _open_or_404(slug)
    _reject_replay_drone(body.drone_id)
    accept = (request.headers.get("accept") or "").lower()
    if "event-stream" in accept or "ndjson" in accept:
        return ndjson_stream(
            request,
            lambda cancel_check: mavlink_download_events(
                slug,
                body.drone_id,
                body.log_id,
                transport=body.transport,
                serial=body.serial,
                confirm_replace=body.confirm_replace,
                cancel_check=cancel_check,
            ),
        )
    result = mavlink_download_log(
        slug,
        body.drone_id,
        body.log_id,
        transport=body.transport,
        serial=body.serial,
        confirm_replace=body.confirm_replace,
    )
    if result.get("ok"):
        rebuild(slug)
    return result


@app.post("/api/experiments/{slug}/ssh/logs")
def post_ssh_logs(slug: str, body: SshListBody):
    _open_or_404(slug)
    _reject_replay_drone(body.drone_id)
    return ssh_list_logs(slug, body.drone_id)


@app.post("/api/experiments/{slug}/ssh/copy")
async def post_ssh_copy(slug: str, body: SshCopyBody, request: Request):
    _open_or_404(slug)
    _reject_replay_drone(body.drone_id)
    files = [f.model_dump() for f in body.files]
    accept = (request.headers.get("accept") or "").lower()
    if "event-stream" in accept or "ndjson" in accept:
        return ndjson_stream(
            request,
            lambda cancel_check: ssh_copy_events(
                slug, body.drone_id, files, cancel_check=cancel_check
            ),
        )
    result = ssh_copy_logs(slug, body.drone_id, files)
    if result.get("ok"):
        rebuild(slug)
    return result


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


@app.get("/api/experiments/{slug}/trajectory")
def get_trajectory(slug: str):
    try:
        result = open_experiment(slug)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="experiment not found")
    return trajectory(result["path"])


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


@app.post("/api/experiments/{slug}/replay/inspect")
def post_replay_inspect(slug: str, body: ReplayInspectBody):
    result = _open_or_404(slug)
    ulog_path, _pid = _physical_ulog(result["path"], result["manifest"], body.drone_id)
    work_root = result["path"] / "replay" / "work"
    try:
        return inspect_and_stage(ulog_path, work_root, slug)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/experiments/{slug}/replay")
def post_replay(slug: str, body: ReplayStartBody):
    result = _open_or_404(slug)
    _ulog_path, parent = _physical_ulog(result["path"], result["manifest"], body.drone_id)
    if is_busy():
        raise HTTPException(status_code=409, detail="replay already running")
    work_root = result["path"] / "replay" / "work"
    results_root = result["path"] / "replay" / "results"
    original_ulg = work_root / body.run_id / "input.ulg"
    if not original_ulg.is_file():
        raise HTTPException(status_code=404, detail="replay job not found")
    try:
        claim_busy()
    except BusyError:
        raise HTTPException(status_code=409, detail="replay already running")
    kwargs = {
        "slug": slug,
        "parent_id": parent,
        "work_root": work_root,
        "results_root": results_root,
        "sitl_log_root": _sitl_log_root(),
        "replay_params_path": host_replay_params_path(),
        "original_ulg": original_ulg,
        "container_ulg": container_ulg_path(slug, body.run_id),
        "claimed": True,
    }

    def _target():
        try:
            start_replay(body.run_id, body.overrides, **kwargs)
        except Exception as exc:
            job = get_job(body.run_id)
            if job is not None:
                job["status"] = "failed"
                job["error"] = str(exc)
            release_busy()

    threading.Thread(target=_target, daemon=True).start()
    return {"ok": True, "run_id": body.run_id}


@app.get("/api/experiments/{slug}/replay/{run_id}")
def get_replay(slug: str, run_id: str):
    _open_or_404(slug)
    job = get_job(run_id)
    if job is None:
        raise HTTPException(status_code=404, detail="replay job not found")
    return job


@app.post("/api/experiments/{slug}/replay/{run_id}/stop")
def post_replay_stop(slug: str, run_id: str):
    _open_or_404(slug)
    try:
        request_stop(run_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="replay job not found")
    return {"ok": True}


@app.get("/api/experiments/{slug}/replay/{run_id}/series")
def get_replay_series(slug: str, run_id: str):
    result = _open_or_404(slug)
    job = get_job(run_id)
    if job is None:
        raise HTTPException(status_code=404, detail="replay job not found")
    original = result["path"] / "replay" / "work" / run_id / "input.ulg"
    replayed = job.get("replayed_ulg")
    if not original.is_file() or not replayed:
        raise HTTPException(status_code=404, detail="replay job not found")
    replayed_path = Path(replayed)
    if not replayed_path.is_file():
        raise HTTPException(status_code=404, detail="replay job not found")
    try:
        return overlay_series(original, replayed_path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.delete("/api/experiments/{slug}/drones/{drone_id}")
def delete_drone(slug: str, drone_id: str):
    try:
        result = delete_replay_drone(slug, drone_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="experiment not found")
    except KeyError:
        raise HTTPException(status_code=404, detail="drone not found")
    return {"slug": result["slug"], "manifest": _manifest_for_api(result["manifest"])}
