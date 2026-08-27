# Updates

## 0.10.0 - Extract ulog topics to parquet
- `ea/extract_ulog.py`: `extract_ulog(ulg_path, dest_dir, extra_topics=())` writes `ALWAYS` topics (+ GPS fallback to `vehicle_global_position`) as `{topic}.parquet` with uint64 `timestamp`
- `tests/test_extract_ulog.py`: fixture via `write_min_ulog`, parquet round-trip asserts `arming_state` and `x`

## 0.9.0 - Minimal ULog fixture writer
- `ea/ulog_min.py`: `write_min_ulog(path, messages)` writes ULog v1 readable by pyulog (vehicle_status, vehicle_local_position, vehicle_attitude, vehicle_gps_position)
- `tests/test_ulog_min.py`: pyulog round-trip test

## 0.8.0 - Import ulog files into experiment raw/
- `ea/ingest_files.py`: `import_paths(slug, paths)` copies `.ulg` into `raw/drone_<id>/`, non-recursive directory scan, `needs_id` for unknown filenames, append-only UTC suffix on collision, manifest `sources.ulg` updated
- `app.py`: `POST /api/experiments/{slug}/import` body `{paths: string[]}`
- `tests/test_ingest_files.py`: import unit tests + API TestClient test

## 0.7.0 - FastAPI health and experiment CRUD
- `web/backend/app.py`: `GET /api/health`, `GET|POST /api/experiments`, `GET /api/experiments/{slug}`, `PATCH /api/experiments/{slug}/manifest`; CORS for frontend port; 404 `{"detail": "experiment not found"}`
- `web/backend/requirements.txt`: fastapi, uvicorn, pyulog, pyarrow, pandas, pymavlink, pytest, httpx
- `web/backend/tests/test_api_experiments.py`: health + CRUD integration tests via TestClient

## 0.6.0 - Experiment store create/list/open
- `ea/store.py`: `create_experiment`, `list_experiments`, `open_experiment`; creates `raw/`, `derived/`, `manifest.json`; `FileExistsError` if folder exists; `missing` = drone ids with empty `sources.ulg`

## 0.5.0 - Manifest v1 load/save
- `ea/manifest.py`: `MANIFEST_VERSION`, `empty_manifest`, `load_manifest`, `save_manifest`, `merge_manifest` (deep-merge ui/sync, per-drone ssh/mavlink; sources preserved unless patch includes them)

## 0.4.0 - Drone id from filename
- `ea/drone_id.py`: `drone_id_from_filename()` via `Group3RLcat(?P<id>\d+)_` or `_d(?P<id>\d+)`; `None` → needs_id

## 0.3.0 - Slug sanitizer
- `ea/slug.py`: `slugify()` keeps `[A-Za-z0-9_-]`, spaces → `_`, rejects empty (`ValueError`)

## 0.2.0 - Ports and paths helpers
- `ports.py`: BACKEND_HOST, BACKEND_PORT 6400, FRONTEND_PORT 6473, FORBIDDEN_PORTS
- `paths.py`: `repo_root()`, `experiments_dir()` with `EA_EXPERIMENTS_DIR` override
- `pytest.ini`: pythonpath, e2e marker, exclude e2e by default

## 0.1.0 - Project bootstrap
- ExperimentAnalysis repo, docs, gitignore for experiment folders
