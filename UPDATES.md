# Updates

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
