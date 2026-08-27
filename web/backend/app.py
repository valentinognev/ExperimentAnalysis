from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from ea.ingest_files import import_paths
from ea.manifest import merge_manifest, save_manifest
from ea.store import create_experiment, list_experiments, open_experiment
from ports import FRONTEND_PORT

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
    return {"slug": result["slug"], "manifest": result["manifest"]}


@app.post("/api/experiments/{slug}/import")
def post_import(slug: str, body: ImportBody):
    try:
        return import_paths(slug, body.paths)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="experiment not found")


@app.patch("/api/experiments/{slug}/manifest")
def patch_manifest(slug: str, patch: dict):
    try:
        result = open_experiment(slug)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="experiment not found")
    merged = merge_manifest(result["manifest"], patch)
    save_manifest(result["path"] / "manifest.json", merged)
    return {"slug": slug, "manifest": merged}
