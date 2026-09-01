# Updates

## 0.79.0 - Replay param enum and bitmask editors
- Replay param table keeps the number field and adds QGC-backed enum dropdowns, bitmask checkboxes, and boolean On/Off
- Compact `paramMeta.json` generated from QGroundControl ParameterFactMetaData; unmatched numbers stay legal (`custom (n)`)
- Regenerate: source `/home/valentin/.config/QGroundControl/ParameterFactMetaData.json`; `cd web/backend && .venv/bin/python -m ea.replay.param_meta ../../web/frontend/src/replay/paramMeta.json`

## 0.78.0 - Di_rj replay rows and Replay tab
- `ea.replay_id` / `replayId.ts`: parse `2_r1` (parent + index), `physical_id`, monotonic `next_replay_index` (mixed int/string ids)
- Replay workspace tab (Sources | Analysis | Replay) on the open experiment; still two processes (`:6400` / `:6473`)
- Sources/Analysis list `Di_rj` after the parent (indent, `replayColor`, ULG summary, no host/Import/SSH/MAVLink); Delete confirms then `DELETE /api/experiments/{slug}/drones/{id}`
- Docker bind `/home/valentin/RL/CatSwarm/ExperimentAnalysis:/home/valentin/ExperimentAnalysis`; recreate `px4-noetic-firm`; do not bind 6500/6573
- Host PX4 is `/home/valentin/Projects/GambitonBiut/docker_firm/PX4-Autopilot`; SITL logs collected from `…/rootfs` (not `fs/microsd/log`); stale `*_replayed.ulg` ignored
- Analysis plots/map/3D use `replayColor` for `Di_rj`; Stop disabled after success/fail; Delete no longer restores that drone's plot panes

## 0.77.0 - Map trail dashes and 2D marker legend
- 2D/3D (Plotly and Cesium) trails use the same color-collision dashes as extra plots: solid when unique, distinct dash per same-color trail
- 2D legend lists each current-T drone marker (per-source symbol) as well as trajectories; ground diamonds stay under Markers

## 0.76.0 - Time scrubber every three figures
- Matching time-axis scrubber repeats before every third channel plot (NED counts as the first figure)
- Extra panes after 3, 6, … get their own thumb aligned to `[0, tMax]`; play / speeds stay on the first bar

## 0.75.0 - Time scrubber matches plot x-axis
- Analysis timeline sits above the channel plots (not under 3D); play / speeds / numeric T on a row above a full-width scrubber
- Scrubber track uses the same left/right Plotly insets (`l: 48`, `r: 16`); thumb at `t/tMax`, centered on the value
- NED and extra panes share `PLOT_TIME_MARGIN` and `automargin: false` so stacked time axes line up with the thumb

## 0.74.0 - Unique dash when extra-plot colors collide
- Extra Plotly panes keep a solid line when a color is unique; same-color traces get distinct dashes (solid / dash / dot / dashdot / longdash / longdashdot, then custom lists)

## 0.73.0 - Plot edit placement, reorder, map legend, marker names
- Edit plot opens the channel picker under that pane; Add plot still opens it above the extra plots
- Up / Down on each extra pane reorder `ui.plots` (disabled at the ends)
- 2D map legend gets more top margin and wraps; zoom/pan sit at the bottom so legend items stay clickable
- Ground marker names are drawn on Plotly 2D and 3D (Cesium already had labels)

## 0.72.0 - Day/night skin
- Night/Day switch in the header; night darkens 3D scene and 2D/Cesium basemap; preference in `localStorage` (`ea-skin`).

## 0.71.2 - SM NED and EKF match on 2D and 3D
- SM NED is a hollow square on both plots (`square-open` / Maki `square-stroked`); OSM has no plus icon
- EKF keeps the black ring on the 2D map (larger black circle behind the fill), same as 3D

## 0.71.1 - 2D/3D pose markers match; plus/x no longer dwarf the body
- SM LLA uses the same X on the OSM map (Maki `cross`) as in 3D (`x`); EKF/GPS stay circle/square on both
- Plotly 3D plus/x size 4 (was 10) so they sit with the size-8 circle instead of covering the trail

## 0.71.0 - Multi-instance topics nest in the channel picker
- Analysis tree groups `name.00` / `name.01` under `name` (instance folders, then fields)
- Channel ids stay `{drone}.{source}.{topic}.{field}` with `topic` still including `.00` / `.01`

## 0.70.5 - 2D map keeps 3D column height
- Dropped the Plotly `height: 280` pin so a pose/trail update cannot shrink the OSM map under the 3D figure
- Map layout uses `autosize` and fills the same `min(70vh, 640px)` column as the 3D view

## 0.70.4 - 2D map trail follows T
- 2D OSM tracks slice to `t ≤ T` like 3D (`sliceTrail`); reverse/jump no longer shows the future path
- Map still uses `uirevision` / `datarevision` so OSM tiles and camera do not reset with the slider

## 0.70.3 - 3D/2D legends stay in their panels
- Plotly 3D legend is inside the scene (top-left), not to the right of the plot where it covered the 2D map
- 2D map legend sits in the top margin (`y ≤ 1`); both plot hosts clip overflow

## 0.70.2 - Unique marker per pose source
- 3D: EKF circle + black ring, GPS square, SM NED cross, SM LLA x (not the white ground diamond)
- 2D map: same distinction via circle / square / triangle / star; Cesium uses matching billboard shapes

## 0.70.1 - 2D map keeps up with the slider
- 2D OSM tracks are the full logged path, converted to LLA once; only current-T markers change with the slider
- Map layout uses `uirevision` / `datarevision` so tiles and camera do not rebuild after each T (3D already did this)

## 0.70.0 - Logged-path trails and pose-source picker
- 3D/2D trails are the logged ENU path (`GET .../trajectory`, ≤20 Hz) sliced to current T; reverse/jump no longer leaves a future chord to the drone
- 2D map draws that path for every enabled source (EKF, GPS, SM NED, SM LLA), not only the current GPS/SM LLA point
- Analysis drone row: checkbox per pose source present in the log; choice saved in `ui.avatars`

## 0.69.3 - Channel plots share experiment time axis
- Default NED plot and extra panes pin x to `[0, tMax]` (`autorange` off) so ulog vs SM ticks line up when series lengths differ

## 0.69.2 - SSH SM pick is the active log
- Copying a selected SM/HA file (SSH or local pick) replaces `sources.system_manager` / `hardware_adapter` with that selection; Sources no longer lists every CSV already in `raw/`
- Rebuild extracts the manifest-listed SM/HA files when present; older CSVs stay on disk
- ULG date/time still parse when a UTC collision suffix is on the filename

## 0.69.1 - SSH and MAVLink pickers on the drone row
- SSH / MAVLink (and local SM/HA pick) dialogs open under that drone, same as Import, not below the whole list

## 0.69.0 - Pick SM/HA by ULG date/time
- SSH and local-folder import: log list sorted by closeness to the ULG filename stamp; closest SM and HA within 24h are pre-checked
- Directory with many SM CSVs (or >2 HA files) returns `needs_pick` instead of copying every file; operator Copy imports the selection
- Sources row lists SM/HA one filename per line (scroll), not a comma wall

## 0.68.3 - Browse opens in the current file's folder
- Import Browse: if the path field is not empty, the native dialog starts in that file's folder (`zenity --filename=` / `kdialog --getopenfilename`)
- `POST /api/browse-file` optional `{start}`; empty/unknown path falls back to the default location

## 0.68.2 - Import Browse left; empty SM CSV no longer 500s
- Import panel: **Browse** is left of the path field; field prefills `sources.ulg_origin` (last imported ulg path) when present
- Import stores that origin on the drone; typed/browsed path is kept if the panel is reopened
- Rebuild skips empty/unparseable `*system_manager*.csv` (`EmptyDataError`) instead of 500 Internal Server Error after Import

## 0.68.1 - Ground markers are white, not drone-yellow
- Plotly 3D / Cesium / 2D map markers use `#FFFFFF` with a black outline (Plotly: black diamond halo; `scatter3d` line does not draw)
- Color is far from every Observation Board drone hue (yellow `#facc15` looked like D4)

## 0.68.0 - Per-drone Import is a file picker on that row
- Sources Import Browse uses a native file dialog (`zenity --file-selection` / `kdialog --getopenfilename`), not a folder picker
- Import panel sits under that drone row; path field is full width
- `POST /api/browse-file`; `api.browseFile()`; typed folder paths still import

## 0.67.1 - NED x/y/z traces are distinguishable
- Default NED plot: same drone color, but x solid/thick, y dashed, z dotted/thin so components do not overlap visually

## 0.67.0 - Rebuild extracts every ulog topic
- `extract_ulog` writes all logged datasets, not only pose/`actuator_armed`; Analysis picker lists them after Rebuild
- Multi-instance topics use `.00` / `.01` in the channel id (e.g. `2.ulog.sensor_accel.00.x`)

## 0.66.0 - Channel tree starts collapsed
- Analysis picker: empty search shows drone roots only (▸); click to expand source → topic → field
- Search still filters and expands matches

## 0.65.0 - Empty channel search shows the full tree
- Analysis picker: empty search expands every drone → source → topic → field so channels can be browsed without typing
- Folders show ▾/▸ and can be collapsed; search still filters and expands matches

## 0.64.0 - Empty channel search shows first drone
- Analysis picker: empty search expands the first drone so sources (`ulog` / `sm` / `ha`) are visible without typing
- Other drones stay collapsed; search still filters and expands matches

## 0.63.0 - Channel picker is a searchable tree
- Analysis Add plot: channels grouped drone → source → topic → field; search filters by substring
- Apply commits the selection; Edit on a plot pane reopens the picker for that plot

## 0.62.1 - Cesium to Plotly switch no longer crashes
- Analysis 3D engine: switching Cesium → Plotly no longer throws `viewer.scene` after `destroy()` (React tree went blank)
- Pointer-event cleanup skips a destroyed Cesium viewer; `destroy()` is guarded

## 0.62.0 - Play and Reverse toggle with Pause
- Analysis transport: idle is Play | Reverse; Play becomes Pause (Reverse disabled); Reverse becomes Pause (Play disabled)
- No separate Pause button

## 0.61.1 - Drones move while play is running
- Pose fetch no longer cancels on every T tick (play is ~60 Hz, pose ~80 ms, so avatars stayed frozen until pause)
- One in-flight GET /pose; apply that result, then catch up to the latest T
- Plotly 3D skips restyle when pose has not changed

## 0.61.0 - EKF body has a black ring
- Plotly 3D / Cesium: `ekf_ned` center is outlined in black; GPS and SM centers are fill-only
- Plotly uses a larger black marker behind the body (scatter3d `marker.line` does not draw in the scene)

## 0.60.0 - Play bar under the 3D plot
- Analysis: timeline (play / reverse / pause, speeds, scrubber) sits in the 3D card footer, not below the channel plots

## 0.59.0 - Drone colors match Observation Board
- `droneColor` uses OB `droneColors.ts` (D1 red, D2 azure, D3 green, D4 yellow, … wrap at 9)
- 3D body/trail, map, Sources swatch, and NED plots share that palette

## 0.58.0 - 3D triad legend is one body per avatar
- Plotly 3D: each triad is a drone-colored center point plus RGB axes; legend shows `D2 ekf`, `D2 gps`, … not three axis rows
- Clicking that legend entry hides/shows the whole avatar (point + axes); trails stay separate
- Cesium draws the same center point on triad avatars

## 0.57.0 - Update trims drones from the end
- Lowering Drone # and **Update** keeps D1..DN and removes higher ids from the manifest, Sources list, and `raw/`/`derived/`
- Selecting a lower count previews fewer rows; growing is still add-missing 1..N
- `PUT /experiments/{slug}/drones` `{count}`

## 0.55.1 - Drone # survives New then Update
- Choosing Drone # before **New** is kept and persisted (D1..DN); Update after New no longer only writes the name
- Empty new experiment no longer clears a pending Drone # selection

## 0.56.0 - Plot markers: double-click add, right-click remove
- Plotly 3D: double-click ground to place a marker; right-click a marker diamond to delete it
- Cesium globe uses the same gestures (double-click / right-click); Plotly camera double-click reset is off
- Marker panel copy matches; × still removes from the list

## 0.55.0 - Sources drone data summary
- Each Sources drone row lists ULG name, date/time from the PX4 filename, SM/HA log names, and the analysis color
- Avatar/plot color is keyed by physical drone id so hiding D1 does not recolor D2

## 0.54.0 - Update replaces Rebuild and Add
- Sources: **Update** persists D1..DN from Drone # and writes `manifest.name` from Name; folder slug unchanged
- Name field fills from the open experiment; New still creates
- Selecting Drone # still previews rows; shrinking the count does not delete drones
- Extract rebuild remains after Import / SSH / MAVLink only

## 0.53.1 - Drone # count matches drone rows
- Choosing N (or opening an experiment whose max saved id is N) shows N rows D1..DN, not only the sparse ids in the manifest
- Add still POSTs 1..N; shrinking the count does not delete drones

## 0.53.0 - Drone # is a single count
- Field is one number 1–9 (not a list of ids); opening an experiment shows max saved id (Baseball → 4)
- Add creates D1..DN; Baseball: set 4, then Import the folder on D2/D3/D4

## 0.52.3 - Drone # shows saved ids for the open experiment
- Opening an experiment fills the Drone # blank option with its saved ids (e.g. `2, 4`)
- Those numbers are disabled in the 1–9 list so Add only offers ids not yet in the manifest

## 0.52.2 - Drone # is a 1–9 dropdown
- Sources experiment line: `Drone #` is a `<select>` of 1–9 (not a free number field)
- Add stays disabled until a number is chosen; E2E uses `selectOption`

## 0.52.1 - Add-drone typecheck and id-0 API test
- `ExperimentBar.test.tsx`: `vi.mocked(addDrone).mock.invocationCallOrder` so tsc accepts the mock
- `POST /experiments/{slug}/drones` with `{"id": 0}` asserted 400

## 0.52.0 - Per-drone Import and drone add
- Sources: New, Drone # / Add, Rebuild; per-row Import / SSH / MAVLink (Pi IP)
- Add POSTs `/experiments/{slug}/drones` `{id}`; Import may send `drone_id` (filename ids pick the matching ulog)
- Tabs still change only on click
- E2E: add 2, 3, 4 then Import Baseball on each row; Analysis shows D2/D3/D4, Plotly, slider

## 0.51.3 - Stream copy/download rebuilds once
- SSE copy/download no longer rebuild inside the async generator (blocked the event loop)
- Stream clients rebuild once via POST /rebuild after the picker shows 100% / Rebuilding…
- JSON copy/download (no event-stream Accept) still rebuilds once on the server

## 0.51.2 - Analysis slider moves 3D drones
- `pose_at` no longer scans every attitude/GPS row with pandas `iterrows` (was ~1.6s per T, so scrub appeared frozen)
- Vectorized LLA/quat columns + searchsorted slerp; Baseball pose ~40ms
- Plotly 3D keeps camera (`uirevision`) and restyles traces via `datarevision` so avatars move in a stable ENU frame

## 0.51.1 - Transfer progress visible (SSE + optimistic bar)
- Picker shows 0% + filename immediately on Copy / Download, bar at top with fill
- Streams `text/event-stream` (`data: <json>`) so browsers flush; Accept event-stream or ndjson
- Picker stays open at 100% / Rebuilding… until rebuild finishes, then closes
- Cancel still aborts (AbortController + rsync kill)

## 0.51.0 - Transfer progress and cancel
- SSH copy and MAVLink download stream NDJSON progress; picker shows percent and file index
- Cancel aborts the request, kills rsync / stops the ulog transfer, and drops partial files
- Manifest and rebuild only after a completed transfer

## 0.50.0 - SSH log pick from probed Pi dirs
- SSH lists remote SM/HA files; operator selects which to copy (same UX as MAVLink)
- Probe CatSwarm `~/RL/CatSwarm/.../logs/`, then `~/RL/system_manager/logs/`, `~/RL/hardware_adapter/logs/`, and `~/RL/logs/` (Python HA default `../logs` from adapter cwd)
- Missing dirs skipped; `POST .../ssh/logs` and `POST .../ssh/copy`
- D2 has SM at `~/RL/system_manager/logs`; `~/RL/hardware_adapter/logs` is often absent

## 0.49.1 - SSH pull survives missing HA logs dir
- `ssh_pull`: rsync `change_dir` / No such file on `hardware_adapter/logs` (or SM) is skipped; pull still ok if the other source copied
- Real rsync errors (auth, timeout, code 1) still fail the pull

## 0.49.0 - MAVLink log pick, TCP or serial, one ulg
- MAVLink menu: TCP (`tcp:{host}:5760`) or Serial (`/dev/ttyUSB0` @ 57600); list onboard logs, operator selects, then download
- One `.ulg` per drone: existing file replaced only after confirm; failed download keeps the old file
- `POST .../mavlink/logs` and `POST .../mavlink/download`; `mavlink_list_logs` / `mavlink_download_log`

## 0.48.0 - SSH status on the drone row
- Tabs change only when the operator clicks them (import/pull/rebuild no longer switch)
- SSH button green when SM/HA logs are already in `raw/` or a pull succeeds
- Failed SSH pull shows a red note on that drone row; empty remote with existing SM/HA is success

## 0.47.2 - SSH/MAVLink stay on Sources
- Pull and Rebuild refresh extracts but do not switch tabs; only Import jumps to Analysis
- `tabAfterAction("import"|"pull"|"rebuild")`; `ExperimentBar` `onRebuilt` separate from `onImported`

## 0.47.1 - Drone list is a column
- `DroneList`: stacked `ul`/`li` (one row per drone) instead of a single wrapping row

## 0.47.0 - Sources and Analysis tabs
- `WorkspaceTabs`: Sources | Analysis; experiment switcher stays in the chrome
- Sources: New, Import/Browse, Rebuild, per-drone Pi IP, SSH/MAVLink; Analysis: visibility, 3D, map, plots, timeline
- Successful import, pull, or rebuild switches to Analysis; empty Analysis prompts opening an experiment
- `ExperimentBar` `showSetup`; `DroneList` `variant`; E2E asserts Analysis after Baseball import

## 0.46.0 - Per-drone Pi host IP after import
- `DroneList`: `D{id} host` text field (placeholder `Pi IP`) before SSH/MAVLink; Enter/blur PATCHes `ssh.host` and `mavlink.url` `tcp:{host}:5760`
- `hosts.ts`: `hostsFromManifest` / `hostPatch`; App hydrates hosts from GET experiment after open/import
- D2/D4 still seed on import; D3 (and others) can be typed in the UI

## 0.45.2 - Browse is a folder dialog, not a file picker
- `ea/browse.py`: prefer `zenity --file-selection --directory` (kdialog 23.08 `--getexistingdirectory` opens a file selector); kdialog remains fallback
- `test_browse.py`: zenity wins when both tools exist

## 0.45.1 - Browse test isolation and README inventory
- `ExperimentBar.test.tsx`: `vi.clearAllMocks()` in `beforeEach`; cancel case waits for Browse re-enable before asserting path
- README UI bullet: Browse next to Import path

## 0.45.0 - Import folder Browse dialog
- `api.browseFolder()` POSTs `/api/browse-folder` (no body); `{path: string | null}`
- `ExperimentBar`: Browse between Import path and Import; fills path on pick, cancel leaves field, does not import/rebuild
- README API table: `POST /browse-folder`

## 0.44.1 - Vite EMFILE: frontend never bound 6473
- `start.sh`: `CHOKIDAR_USEPOLLING=1` for Vite (same as Observation Board / Playwright); native `fs.watch` hit EMFILE and Vite exited while the script still printed "running"
- `vite.config.ts`: `server.watch.usePolling: true` so `npm run dev` without the env also avoids inotify
- `test_scripts.py` / `ports.test.ts`: assert polling is set

## 0.44.0 - Full README product description
- `README.md`: purpose, non-goals, data flow, ingest/sync/ENU/avatars, API table, run/test, Baseball operator guide; still names `UPDATES.md`

## 0.43.1 - Review fix-wave (duration, SM, avatars)
- `ea/duration.py`, `GET .../duration`, `sync.json` `t_max_s`; `App.tsx` dynamic Timeline `tMax`
- SM topics/series from `derived/drone_*/sm_system_manager.parquet`; `local_ts`+`t_sm`; HA first-sample time; exclude `sm_*` from ulog topics
- Pull success triggers `rebuild`; `ExperimentBar` Rebuild button; `DroneList` rebuild after ok pull
- Multi-avatar 3D/map (`ekf_ned`, `gps`, `sm_ned`, `sm_lla`); `ui.avatars` default-on
- `api.ts` throws on HTTP error; GET experiment redacts `ssh.password`

## 0.43.0 - Baseball UI E2E
- `web/frontend/e2e/baseball.spec.ts`: Playwright import/rebuild on `/home/valentin/RL/TESTFLIGHTS/Baseball`; asserts D2/D3/D4, Plotly 3D, time slider
- `web/frontend/playwright.config.ts`: spawns API `:6400` (`EA_EXPERIMENTS_DIR=/tmp/ea-e2e-experiments`, cleaned each run) and Vite `:6473` (`CHOKIDAR_USEPOLLING` for EMFILE)
- `ExperimentBar`: accessible labels `Name` + button `New`; Import input/button split for correct `getByLabel`
- `vite.config.ts`: exclude `e2e/**` from Vitest

## 0.42.0 - Baseball backend E2E
- `tests/test_e2e_baseball.py`: import/rebuild/pose/series/topics on operator ulogs at `/home/valentin/RL/TESTFLIGHTS/Baseball` (`@pytest.mark.e2e`)
- `ea/pose.py`: `_lla_from_row` for PX4 `latitude_deg`/`longitude_deg`/`altitude_msl_m` columns (real ulogs)
- `ea/pose.py`: T=0 ARM slack (0.5s) when first sample is slightly post-ARM

## 0.41.0 - Baseball operator guide
- README: import `/home/valentin/RL/TESTFLIGHTS/Baseball`, D2/D4 SSH hosts, D3 ulog-only; ports 6400/6473
- `test_layout.py`: README operator-guide strings

## 0.40.0 - Cesium lazy 3D engine
- `engineToggle.ts`: `shouldLoadCesium`; Plotly | Cesium toggle PATCHes `ui.engine3d`
- `View3DCesium.tsx`: lazy `import("cesium")`, OSM `UrlTemplateImageryProvider`, body triads as polylines
- `vite.config.ts`: `CESIUM_BASE_URL`, static copy Workers/Assets/Widgets; port 6473 unchanged
- `triad.ts`: `triadSegments` shared by Plotly and Cesium

## 0.39.1 - SM LLA-at-ARM offset fix
- `ea/pose.py`: `_sm_lla_at_arm` uses unoffset experiment times (spatial ref at raw ARM, like `_gps_lla_at_arm`)
- `tests/test_manual_offset.py`: offset 1.5 must not shift SM NED reference LLA to pre-ARM sample

## 0.39.0 - Per-drone manual time offsets
- `ea/sync.py`: `t_ulog` / `t_sm` accept `offset_s` (default 0); `T_final = T_arm + offset`
- `ea/pose.py`, `ea/series.py`: read `manifest.sync.manual_offsets_s[str(drone_id)]` per drone
- `tests/test_manual_offset.py`: offset 1.5 shifts pose; unit tests for `t_ulog`/`t_sm`

## 0.38.1 - SM NED reference priority fix
- `ea/pose.py`: `sm_ned` ref order — `initialPos_lla/*`, then SM `lla/*` at ARM, then PX4 home/GPS; dropped `initialPos_lla/0..2` heuristic
- `tests/test_pose_sm.py`: 3 tests where SM origin offset ≠ PX4 home

## 0.38.0 - SM pose avatars sm_ned and sm_lla
- `ea/pose.py`: `sm_ned` / `sm_lla` avatars from `sm_system_manager.parquet` via `t_sm(local_ts)`; NED ref from home/GPS-at-ARM or `initialPos_lla`; `filt_lla/*` fallback
- `tests/test_pose_sm.py`: SM-only without ulog `present`, beside ekf/gps, column omission, local frame

## 0.37.1 - Assignment import path fix
- `ExperimentBar`: second import posts only `needs_id` file paths, not the whole directory (avoids duplicate `_utc` copies of already-imported named files)
- `tests/test_needs_id.py`: mixed folder second import does not recopy named ulog

## 0.37.0 - needs_id assignment + sim folder import
- `ea/ingest_files.import_paths`: optional `assignments` maps filename → drone id; copies SM CSVs and HA logs from directories into `raw/drone_<id>/`; manifest `sources.system_manager` / `hardware_adapter` via same filename hints as SSH ingest
- `POST /api/experiments/{slug}/import` body may include `{assignments}`; unknown names still in `needs_id` when unassigned
- `ExperimentBar`: prompts for drone ids when import returns `needs_id`, then re-imports with assignments
- README: local import paths for `system_manager/logs/` and `hardware_adapter/logs/`

## 0.36.0 - POST pull + host seeds
- `POST /api/experiments/{slug}/pull` `{drone_id, adapters:["ssh"|"mavlink"]}` → `{ok, drones}`; password redacted from errors
- `ea/ingest_files._default_drone`: seed D2 `192.168.31.30`, D4 `192.168.31.152`, user `pi`, mavlink tcp 5760; D3 no host
- `DroneList.tsx`: per-drone SSH / MAVLink pull buttons; `api.pullDrone`
- `tests/test_api_pull.py`: mocked ingest, 404, password redaction, host seeds

## 0.35.1 - MAVLink LOG_REQUEST arg order fix
- `ea/ingest_mavlink.py`: `log_request_list_send(1, 1, 0, 0xFFFF)` and `log_request_data_send(1, 1, id, ofs, count)` — pymavlink parameter order
- `tests/test_ingest_mavlink.py`: FakeMav signatures aligned; `test_log_request_list_uses_pymavlink_arg_order`

## 0.35.0 - MAVLink ulog download (mocked)
- `ea/ingest_mavlink.py`: `mavlink_pull(slug, drone_id, connect=...)` LOG_REQUEST_LIST/DATA into `raw/drone_<id>/`; url from `mavlink.url` or `tcp:{ssh.host}:5760`; no COMMAND_LONG
- `tests/test_ingest_mavlink.py`: fake conn download, COMMAND_LONG spy, no-logs error preserves raw

## 0.34.1 - SSH ingest empty-remote fix
- `ea/ingest_ssh.py`: empty remote detected by zero new files / empty rsync listing, not empty dest (preserves imported ulogs)
- `tests/test_ingest_ssh.py`: lock rsync argv (both remotes, pi@host:, publickey, timeout 30, no password in argv); empty remote with existing raw

## 0.34.0 - SSH ingest (mocked)
- `ea/ingest_ssh.py`: `ssh_pull(slug, drone_id, runner=...)` rsyncs Pi SM/HA logs into `raw/drone_<id>/`; publickey-only SSH, 30s timeout, password redaction, empty-remote error
- `tests/test_ingest_ssh.py`: fake runner argv/timeout, password redaction, empty remote, raw preserved on failure

## 0.33.0 - HA log extract
- `ea/extract_ha.py`: `extract_ha(log, dest)` → `ha_diag.parquet` / `ha_mavlink.parquet` or `"skipped"` when no parseable timestamps
- `ea/rebuild.py`: extract `*adapter_diag*.log` and `*mavlink*` under `raw/drone_*` into `derived/ha/drone_<id>`
- `ea/topics.py`: discover drones from `derived/ha/` and `derived/sm/` as well as `derived/drone_*`
- `tests/test_extract_ha.py`: unparseable skip, datetime lines, float timestamps, rebuild topics

## 0.32.1 - SM rebuild CSV filter fix
- `ea/rebuild.py`: `_sm_csv_paths` only matches `*system_manager*` (case insensitive); no arbitrary `*_dN*`
- `tests/test_rebuild_sm.py`: rebuild → parquet + sync `sm_arm_local_ts`; non-SM `_dN` CSV ignored
- `tests/test_extract_sm.py`: string `"4"` counts as ARM

## 0.32.0 - SM CSV extract + S4 ARM
- `ea/extract_sm.py`: `extract_sm(csv, dest)` → `sm_system_manager.parquet` (original columns)
- `ea/arm.py`: `sm_arm_local_ts(df)` — first S4 row via `local_ts` (`4`, `"4"`, `S4_TAKEOFF`)
- `ea/rebuild.py`: extract `*system_manager*.csv` from `raw/drone_*`, fill `sm_arm_local_ts` in sync
- `tests/test_extract_sm.py`: S4 parquet/ARM, no-S4 None, numeric 4, Pi/FC T=0 alignment

## 0.31.0 - Unsynced ARM banner
- `unsynced.ts` / `unsynced.test.ts`: `bannerText(drones)` lists unsynced ids from `pose.drones[].synced`
- `App.tsx`: amber status banner when any drone is unsynced; 3D still renders all visible drones

## 0.30.0 - start/kill/attach/install scripts
- `start.sh`: tmux `experiment_analysis` session, backend `127.0.0.1:6400`, frontend `127.0.0.1:6473`; `--port=` overrides frontend only
- `killall.sh`: frees only 6400/6473 (and frontend override); leaves ObservationBoard untouched
- `attach.sh`: `tmux attach -t experiment_analysis`
- `install.sh`: `web/backend/.venv`, pip requirements, `npm install` in frontend
- `tests/test_scripts.py`: scoped port/session assertions

## 0.29.0 - Vector arrows on avatars
- `ea/series.py`: `channel_value_at_t()` — single-channel interpolation at t from parquet
- `ea/pose.py`: `drones[id].vectors.velocity` from `ui.vectors` channels via `ned_to_enu`
- `tests/test_vectors.py`: NED vy=1 → ENU e=1; omitted without manifest config
- `View3D.tsx`: dashed velocity line from avatar base, scaled by manifest `scale`
- `App.tsx` / `api.ts`: hydrate `ui.vectors`, pass vector overlay to View3D

## 0.28.0 - Linked 2D OSM scattermap
- `map2d.ts` / `map2d.test.ts`: `mapFigure` helper — Plotly `scattermap`, `map.style: "open-street-map"`, lat/lon arrays
- `Map2D.tsx`: GPS avatar positions (ENU→LLA via origin) + markers at current T; collapsible panel
- `App.tsx`: Map2D beside 3D; `map_linked` default open when any drone has GPS avatar
- `api.ts`: `PoseDrone.avatars.gps` optional type

## 0.27.2 - Dense pickable ground surface
- `groundPlane.ts`: 21×21 `surface` at u=0, `hoverinfo: "none"` (gl3d picks skip `"skip"`)
- `groundPlane.test.ts`: assert surface/mesh3d density, z=0, `hoverinfo === "none"`

## 0.27.1 - Clickable ground plane for markers
- `groundPlane.ts`: `groundPlaneExtent`, `groundPlaneTrace` (mesh3d u=0 quad)
- `groundPlane.test.ts`: extent bbox + mesh3d z=0 unit tests
- `View3D.tsx`: subtle gray ground plane when `onGroundClick` set so empty-ground clicks reach `groundClickToLla`

## 0.27.0 - Ground markers and distances
- `ea/markers.py`: `Marker`, `enu_to_lla`, `distance_m` (haversine horizontal + 3D ENU)
- `app.py`: PATCH `/api/experiments/{slug}/markers` replaces `ui.markers`
- `tests/test_markers.py`: 1 m north, roundtrip, PATCH roundtrip, alt delta 3D
- `markers.ts` / `markers.test.ts`: frontend geo + `groundClickToLla`
- `MarkerPanel.tsx`: list markers, select two → distances
- `View3D.tsx`: ground click adds marker; scatter3d marker diamonds
- `App.tsx`: marker state, debounced `patchMarkers`, panel beside 3D

## 0.26.0 - Persist UI layout in manifest
- `web/backend/tests/test_api_manifest_ui.py`: PATCH `ui.plots` + `visible_drone_ids` roundtrip via GET
- `web/frontend/src/api.ts`: `patchManifest(slug, patch)` → PATCH manifest
- `web/frontend/src/debounce.ts`: 300ms debounce helper + unit tests
- `App.tsx`: load `visible_drone_ids`, `plots`, `avatars`, `engine3d`, `map_linked` from manifest on open; debounced PATCH on change
- `PlotBoard.tsx`: plots lifted to App for manifest persist

## 0.25.1 - PlotBoard refresh on slug switch and rebuild
- `plotBoard.ts`: `plotsForSlug` clears plots when experiment slug changes (A→B)
- `PlotBoard.tsx` / `ChannelPlot.tsx`: `refreshToken` prop refetches topics/series after import-rebuild
- `App.tsx`: passes `refreshToken` into PlotBoard and ChannelPlot

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
