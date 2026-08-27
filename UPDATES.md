# Updates

## 0.25.0 - User-defined Plotly channel panes
- `web/frontend/src/plotBoard.ts`: `PlotDef`, `addPlot`/`removePlot`/`setPlotChannels`, `flattenTopics`
- `web/frontend/src/api.ts`: `getTopics(slug)` → GET `/api/experiments/{slug}/topics`
- `web/frontend/src/components/PlotBoard.tsx`: Add plot → channel picker from topics tree; extra Plotly panes with shared T cursor
- `App.tsx`: mounts PlotBoard below default NED ChannelPlot (in-memory only; manifest persist Task 28)
- `plotBoard.test.ts`: reducer + flattenTopics unit tests

## 0.24.0 - GPS avatar beside EKF in pose_at
- `ea/pose.py`: `_interpolate_gps_enu` — linear lat/lon/alt in experiment time → `lla_to_enu` vs origin; `avatars.gps` alongside `ekf_ned` when GPS parquet exists (`vehicle_gps_position` or `vehicle_global_position`)
- `tests/test_pose_gps.py`: GPS+EKF avatars, origin ENU ~0 at T=0, 1 m north at later T, no-GPS omits `gps` key

## 0.23.1 - Refresh drone visibility after import
- `visibleDrones.ts`: `mergeDroneIds(listed, poseIds)` — listed-first union with pose keys
- `ExperimentBar.tsx`: `rebuild(slug)` + `onImported` after successful import
- `App.tsx`: `refreshToken` reloads drone ids on import; unions `pose.drones` keys; new ids default visible
- `visibleDrones.test.ts`: mergeDroneIds unit tests

## 0.23.0 - Default NED plots and drone visibility
- `web/frontend/src/visibleDrones.ts`: `filterVisible(ids, visible)` — empty visible → none shown
- `web/frontend/src/api.ts`: `getSeries(slug, channels, t0?, t1?)` — repeatable `channels` query params
- `web/frontend/src/components/DroneList.tsx`: checkbox per drone id toggles visible set
- `web/frontend/src/components/ChannelPlot.tsx`: Plotly 2D NED x/y/z vs t for visible drones; vertical T cursor via shapes
- `App.tsx`: DroneList + ChannelPlot; View3D filters to visible present drones
- `src/visibleDrones.test.ts`, `api.test.ts`: filterVisible + getSeries URL

## 0.22.0 - Timeline scrub and playback
- `web/frontend/src/components/Timeline.tsx`: range slider, numeric T, Play/Reverse/Pause, speed 0.25/1/2/4×; rAF + `advance` from `timeCursor`; exported `nextDirection`
- `App.tsx`: mounts Timeline with `t`/`setT`, `tMax=60`
- `src/components/Timeline.test.tsx`: vitest + testing-library (direction helpers, speed buttons, play/pause/reverse)
- devDeps: `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `jsdom`

## 0.21.0 - 20 Hz pose trails
- `web/frontend/src/downsample.ts`: `downsampleHz(ts, maxHz=20)` — keep first/last and samples ≥1/maxHz apart
- `web/frontend/src/api.ts`: `getPose(slug, t)` + `PoseResponse` types; GET `/api/experiments/{slug}/pose?t=`
- `web/frontend/src/usePose.ts`: fetch pose when slug or T changes
- `App.tsx`: pose at T=0, per-drone trail history downsampled to ≤20 Hz; View3D for present drones
- `View3D.tsx`: multi-drone triads + scatter3d trail lines per drone
- `src/downsample.test.ts`, `api.test.ts`: dense/sparse downsample, getPose URL

## 0.20.0 - Plotly 3D body-axis triads
- `web/frontend/src/triad.ts`: `triadTraces(pos, q_xyzw, scale)` — scatter3d line traces RGB body x/y/z; FRD→NED quaternion rotate, `ned_to_enu` mapping
- `web/frontend/src/components/View3D.tsx`: react-plotly.js Plot; re-exports `sceneLayout` from `view3dLayout.ts` (x=E, y=N, z=U)
- `src/triad.test.ts`: identity axis ends, pos offset, scene axis titles
- deps: `react-plotly.js`, `plotly.js`, `@types/plotly.js`

## 0.19.0 - Experiment switcher API client
- `web/frontend/src/api.ts`: `listExperiments`, `createExperiment`, `openExperiment`, `importPaths`, `rebuild` — relative `/api/...` fetch + json
- `web/frontend/src/components/ExperimentBar.tsx`: slug dropdown, New name+Create, Import path+Import
- `App.tsx`: wires ExperimentBar, keeps h1 ExperimentAnalysis
- `src/api.test.ts`: vitest with mocked fetch for all five API functions

## 0.18.0 - Vite React Tailwind frontend scaffold
- `web/frontend/`: React 19 + Vite 7 + Tailwind 4 (`@tailwindcss/vite`); dev server `127.0.0.1:6473`, proxy `/api` → `http://127.0.0.1:6400`
- `App.tsx`: h1 ExperimentAnalysis, dark `bg-zinc-950 text-zinc-100`
- `src/ports.test.ts`: vitest asserts port 6473, proxy target 6400, app title

## 0.17.0 - Rebuild pipeline and pose/series HTTP API
- `ea/rebuild.py`: `rebuild(slug)` — extract all `raw/drone_*/*.ulg` to `derived/drone_{id}/` via `extract_ulog` with `extra_topics=("actuator_armed",)`, `ulog_arm_us` per drone, `write_sync` → `derived/sync.json`
- `app.py`: `POST /api/experiments/{slug}/rebuild`, `GET pose?t=`, `GET series?channels=` (repeatable), `GET topics`; unknown slug → 404 `experiment not found`
- `tests/test_api_pose.py`: import min ulog `Group3RLcat2_log_1.ulg`, rebuild, pose at T=0 present, series/topics, unknown slug 404

## 0.16.0 - Channel topics and series
- `ea/topics.py`: `list_topics(experiment_dir)` — drone → source → topic → fields from derived parquet (ulog/sm/ha when present)
- `ea/series.py`: `series(experiment_dir, channels, t0, t1)` — experiment-time arrays via `t_ulog`, 20 Hz downsample on pose topics, invalid channels → empty arrays
- `tests/test_series.py`: ARM T=0, invalid channel, list_topics tree, t0/t1 window, dense downsample

## 0.15.0 - pose_at query builder
- `ea/pose.py`: `pose_at(experiment_dir, t)` — manifest drones, sync synced flag, EKF NED→ENU (world via GPS/home at ARM or `local_frame`), attitude wxyz→xyzw, origin from mean GPS LLA at T=0
- `tests/test_pose.py`: single-drone interpolation, partial manifest, GPS int scaling origin, no-GPS local frame

## 0.14.0 - Pose interpolation
- `ea/interp.py`: `interp_scalar` (numpy linear, None outside range/empty), `slerp_xyzw` (normalize, flip sign if dot<0, sin blend)
- `tests/test_interp.py`: midpoint scalar, range/empty None, slerp identity→90° z at midpoint ≈45°, endpoints

## 0.13.0 - Geo ENU helpers
- `ea/geo.py`: `WGS84_A_M`, `METERS_PER_DEG_LAT`, `lla_to_enu`, `ned_to_enu`, `mean_origin` (spherical WGS84, matches OB `geo.ts`)
- `tests/test_geo.py`: 1m north ENU, NED→ENU, mean origin, empty llas `ValueError`

## 0.12.0 - ARM experiment time mapping
- `ea/sync.py`: `t_ulog`, `t_sm`, `write_sync` → `derived/sync.json` with `ulog_arm_us`, `sm_arm_local_ts`, `synced`, `note`; `synced` True iff `ulog_arm_us` is not None
- `tests/test_sync.py`: two-drone ARM T=0, missing ARM uses first sample, SM uses `local_ts`

## 0.11.0 - Detect PX4 ARM timestamp
- `ea/arm.py`: `ulog_arm_us(status_parquet, actuator_parquet)` — first `arming_state == 2`, else first `armed` in actuator parquet; `None` if never armed
- `tests/test_arm.py`: two-row vehicle_status → 5000; all-disarmed → `None`

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
