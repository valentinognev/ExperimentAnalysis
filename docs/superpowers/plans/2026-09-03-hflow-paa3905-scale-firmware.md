# H-Flow PX4 firmware: optical-flow scale 1.70

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> This plan is **PX4 / Holybro H-Flow**, not ExperimentAnalysis UI. Do **not** edit ExperimentAnalysis application code. Do **not** flash a Pixhawk `.px4` onto the sensor.

**Goal:** Build and flash `holybro_h-flow_default` so H-Flow publishes flow radians ~1.70× stock, matching GPS Doppler on the 2026-09-02 SensorTest walk (OF was 0.59× GPS).

**Architecture:** UAVCAN on H-Flow publishes `vehicle_optical_flow` (see `src/drivers/uavcannode/Publishers/FlowMeasurement.hpp`). That topic is produced on the **node** by `VehicleOpticalFlow`, which multiplies `pixel_flow` by `SENS_FLOW_SCALE`. Set the **H-Flow board default** to `1.70` and raise the param `@max` from `1.5` to `2.0` so the value is not clamped. Do **not** change `PIXART_RESOLUTION` in `PAA3905.cpp` (shared with ARK Flow MR). Do **not** set `SENS_FLOW_SCALE` on the Pixhawk (FC `VehicleOpticalFlow` would apply it a second time).

**Tech Stack:** PX4 NuttX cannode, `arm-none-eabi`, Docker `px4-noetic-firm`, DroneCAN SD-card update (board id **87**).

**Spec:** SensorTest analysis (ExperimentAnalysis experiment `SensorTest`, D2 ulog `sensorsTest_RLcat2_log_1_2026-9-2-10-40-50.ulg`). Write-up: `ExperimentAnalysis/.lavish/of-vs-gps-sensortest.html`. Evidence: moving OF.01 `vel_ne` vs GPS Doppler scale **0.59** (r² ~0.84 speed, ~0.95 N/E); D4 same walk **0.59**. Height is H-Flow AFBR-S50 ~1.02 m (not the error). Root cause: `PAA3905.cpp` copies PAW3902 `PIXART_RESOLUTION = 11.914` CPI/m onto a **42°** H-Flow lens (~25°-class constant → 25/42 ≈ 0.60).

## Global Constraints

- Host PX4 tree: `/home/valentin/Projects/GambitonBiut/docker_firm/PX4-Autopilot`
- Inside `px4-noetic-firm` the same tree is `/home/valentin/PX4-Autopilot` (compose bind: `docker_firm` → `/home/valentin`).
- Build **only** `holybro_h-flow_default`. Optional `holybro_h-flow_canbootloader` **only** if the node is bricked / solid red LED and docs require it. Never `px4_fmu-*` / Pixhawk targets for this flash.
- Target: `holybro_h-flow_default`. UAVCAN name `org.holybro.h-flow`. `firmware.prototype` `board_id` **87**. `uavcan_board_identity` `HW_VERSION_MINOR` **87**.
- Correction factor **1.70** (`1 / 0.59`). Named constant or param default `1.70f`, not a bare `7.01` without comment.
- **One** scale site: H-Flow `SENS_FLOW_SCALE` default `1.70`. Do **not** also multiply `pixel_flow` in `PAA3905.cpp`. Do **not** change `PAW3902.cpp`. Do **not** set Pixhawk `SENS_FLOW_SCALE` to 1.70.
- Raise `SENS_FLOW_SCALE` `@max` to `2.0` in `sensor_params_flow.c` (QGC/param metadata currently `@max 1.5`; `1.70` will clamp without this).
- H-Flow `rc.board_sensors` already starts `paa3905 -s start -Y 180` and `afbrs50`. Keep that. Add `param set-default SENS_FLOW_SCALE 1.70` there.
- Confirm `CONFIG_MODULES_SENSORS=y` on the h-flow board (already true) so `SENSORS_VEHICLE_OPTICAL_FLOW` default `y` is in the image. If a custom defconfig disables it, `SENS_FLOW_SCALE` will not apply — abort and report.
- Flash **both** airframes that have H-Flow (SensorTest D2 and D4). One binary, two nodes.
- Docker: `px4-noetic-firm` from `/home/valentin/Projects/GambitonBiut/dockerfiles_firm`. Do not bind 6500/6573. Do not start ExperimentAnalysis servers for this task.
- Do not `git commit` or `git push` in PX4 unless the human explicitly asks in that session.
- Do not create extra `.md` files.

## File map

- Modify: `/home/valentin/Projects/GambitonBiut/docker_firm/PX4-Autopilot/src/modules/sensors/sensor_params_flow.c` (`@max` 1.5 → 2.0)
- Modify: `/home/valentin/Projects/GambitonBiut/docker_firm/PX4-Autopilot/boards/holybro/h-flow/init/rc.board_sensors` (set-default `SENS_FLOW_SCALE 1.70`)
- Do not modify: `src/drivers/optical_flow/paa3905/PAA3905.cpp` `PIXART_RESOLUTION` (shared driver)
- Do not modify: `src/drivers/optical_flow/paw3902/PAW3902.cpp`
- Build artifact: `build/holybro_h-flow_default/holybro_h-flow_default.bin` (and `.px4`)

## Why this is the best fix (do not substitute)

| Approach | Why not (for this task) |
|---|---|
| Pixhawk `SENS_FLOW_SCALE=1.70` only | This FC log has **no** `SENS_FLOW_*` group (pre-1.16). Even on 1.16, QGC max is 1.5. Correction would not apply to raw CAN radians seen by old FCs. |
| Change `PIXART_RESOLUTION` to `7.01` in `PAA3905.cpp` | Same driver is used on other PAA3905 boards (e.g. ARK Flow MR). Would mis-scale them. |
| Patch CPI **and** node `SENS_FLOW_SCALE=1.70` | Double scale (~2.89×). |
| Enable FC `EKF2_GPS_CTRL` velocity bit | Hides the camera error in the EKF; does not fix H-Flow. |
| Use 120° IR LED as FOV | Illuminator only; that would make flow **larger**. We need **larger** published radians from a **too-small** measurement. |

---

### Task 1: Raise `SENS_FLOW_SCALE` max to 2.0

**Files:**
- Modify: `src/modules/sensors/sensor_params_flow.c` (block `PARAM_DEFINE_FLOAT(SENS_FLOW_SCALE, 1.f)`)

**Interfaces:**
- Consumes: existing param `SENS_FLOW_SCALE` default `1.f`, `@min 0.5`, `@max 1.5`
- Produces: same param, `@max 2.0` (min and default unchanged)

- [ ] **Step 1: Confirm current metadata**

Open `src/modules/sensors/sensor_params_flow.c`. The block must match:

```c
/**
 * Optical flow scale factor
 *
 * @min 0.5
 * @max 1.5
 * @decimal 2
 * @group Sensors
 */
PARAM_DEFINE_FLOAT(SENS_FLOW_SCALE, 1.f);
```

- [ ] **Step 2: Change only `@max`**

```c
/**
 * Optical flow scale factor
 *
 * @min 0.5
 * @max 2.0
 * @decimal 2
 * @group Sensors
 */
PARAM_DEFINE_FLOAT(SENS_FLOW_SCALE, 1.f);
```

Do not change the default `1.f` here (Pixhawk and other boards stay 1.0).

- [ ] **Step 3: Confirm no second definition**

```bash
rg -n "PARAM_DEFINE_FLOAT\\(SENS_FLOW_SCALE" src/
```

Expected: only `src/modules/sensors/sensor_params_flow.c`.

---

### Task 2: H-Flow board default 1.70

**Files:**
- Modify: `boards/holybro/h-flow/init/rc.board_sensors`

**Interfaces:**
- Consumes: `SENS_FLOW_SCALE` with `@max 2.0` from Task 1
- Produces: H-Flow NuttX boot sets default `1.70` before sensors start

- [ ] **Step 1: Read the current script**

File is:

```sh
#!/bin/sh
#
# board sensors init
#------------------------------------------------------------------------------

param set-default IMU_GYRO_RATEMAX 1000
param set-default SENS_IMU_CLPNOTI 0

# SPI 1
icm42688p -R 0 -s start

# SPI 2
paa3905 -s start -Y 180

# SPI 3
afbrs50 start
```

- [ ] **Step 2: Add the scale default immediately after the other `param set-default` lines**

```sh
#!/bin/sh
#
# board sensors init
#------------------------------------------------------------------------------

param set-default IMU_GYRO_RATEMAX 1000
param set-default SENS_IMU_CLPNOTI 0
# SensorTest 2026-09-02: GPS Doppler / H-Flow vel_ne = 1.70 (PAA3905 42° vs 11.914 CPI)
param set-default SENS_FLOW_SCALE 1.70

# SPI 1
icm42688p -R 0 -s start

# SPI 2
paa3905 -s start -Y 180

# SPI 3
afbrs50 start
```

Keep `paa3905 -Y 180`. Do not add FC-side params (`EKF2_*`, `UAVCAN_SUB_*`).

- [ ] **Step 3: Confirm vehicle optical flow is in this board config**

```bash
rg -n "CONFIG_MODULES_SENSORS|CONFIG_SENSORS_VEHICLE_OPTICAL_FLOW" boards/holybro/h-flow/default.px4board
```

Expected: `CONFIG_MODULES_SENSORS=y`. `CONFIG_SENSORS_VEHICLE_OPTICAL_FLOW` may be absent (Kconfig default `y` when `MODULES_SENSORS`). If the file has `CONFIG_SENSORS_VEHICLE_OPTICAL_FLOW is not set`, **stop** and report — the param would not run on the node.

---

### Task 3: Build `holybro_h-flow_default` in Docker

**Files:**
- Produce: `PX4-Autopilot/build/holybro_h-flow_default/holybro_h-flow_default.bin`
- Produce: `PX4-Autopilot/build/holybro_h-flow_default/holybro_h-flow_default.px4`

- [ ] **Step 1: Ensure the container is running**

```bash
cd /home/valentin/Projects/GambitonBiut/dockerfiles_firm
docker compose ps px4-noetic-firm
```

If not running:

```bash
cd /home/valentin/Projects/GambitonBiut/dockerfiles_firm
docker compose up -d --no-build px4-noetic-firm
```

- [ ] **Step 2: Build only the H-Flow app**

```bash
docker exec -it px4-noetic-firm bash -lc 'cd /home/valentin/PX4-Autopilot && make holybro_h-flow_default'
```

Expected: exit 0. Binary under `build/holybro_h-flow_default/`.

If `make` fails on git submodules (root in container), set `git config --global --add safe.directory '*'` **inside the container** for that shell only if needed, then retry. Do not change the user’s host git config.

- [ ] **Step 3: Confirm artifact and board id**

```bash
ls -l /home/valentin/Projects/GambitonBiut/docker_firm/PX4-Autopilot/build/holybro_h-flow_default/holybro_h-flow_default.bin
python3 -c "import json; p=json.load(open('/home/valentin/Projects/GambitonBiut/docker_firm/PX4-Autopilot/build/holybro_h-flow_default/holybro_h-flow_default.px4')); print('board_id', p.get('board_id'), 'size', p.get('image_size'))"
```

Expected: `board_id` **87**.

- [ ] **Step 4: Confirm the image is not an FMU target**

The filename and `description` in the `.px4` JSON must say Holybro H-Flow / h-flow. If `board_id` is not 87, **do not copy it to an SD card**.

---

### Task 4: Flash via DroneCAN (each vehicle)

**Files:**
- Copy host binary onto that vehicle’s **flight controller** SD card root (not the H-Flow PCB).

- [ ] **Step 1: Identify vehicles**

SensorTest: D2 (`192.168.31.30`) and D4 (`192.168.31.152`). Flash **both** H-Flow modules (same binary).

- [ ] **Step 2: Copy firmware to SD root**

Power off. Copy **one** of these onto the FC SD card **root** (not `/ufw`):

- `holybro_h-flow_default.bin`, or
- if the FC only accepts the UAVCAN hw id name: `87.bin` (copy of that `.bin`)

Holybro/PX4: on reboot the FC pushes the file over CAN. Success: the file **disappears** from SD root and `XX.bin` appears under `/ufw`.

LED: rapid blue/red blink = update in progress. Solid blue = normal. Solid red = failure (SD missing, wrong binary, or bootloader). Then: remove leftover binaries from SD root **and** `/ufw`, retry. Do not flash `*_canbootloader` unless this failure persists and Holybro docs require it.

- [ ] **Step 3: Confirm node came back**

Pixhawk NSH / QGC MAVLink console:

```
uavcan status
```

Expected: an `org.holybro.h-flow` node. QGC Parameters: a CAN **component** (not the FMU) showing `SENS_FLOW_SCALE` = **1.70**.

- [ ] **Step 4: Confirm Pixhawk scale stayed 1.0**

On the **flight controller** component, `SENS_FLOW_SCALE` must be **absent** (this CatSwarm FC) or **1.0**. If you set 1.70 on the FMU, revert it.

- [ ] **Step 5: Repeat Step 2–4 for the second drone**

---

### Task 5: Flight / walk verification

**Files:** none in git. New ulog + ExperimentAnalysis compare.

- [ ] **Step 1: Repeat the SensorTest walk**

Same protocol as 2026-09-02: ~1 m AGL, 1–2 m/s, FC logging. Prefer a taped 10 m at constant heading.

- [ ] **Step 2: Align on FC timestamps, not Analysis T**

The old log never armed. ExperimentAnalysis ARM mode sets **per-topic** T=0 (`sensor_gps` started 2.11 s before `estimator_optical_flow_vel.01`). Compare `estimator_optical_flow_vel` vs `vehicle_gps_position` using **ulog `timestamp`**, not Analysis plot T.

Use `vehicle_gps_position` (~7 Hz), not `sensor_gps` (~1 Hz).

- [ ] **Step 3: Compute scale**

On samples with GPS horizontal speed `> 0.5` m/s:

`k = OF_speed / GPS_speed` through origin (`OF = k * GPS`).

Stock was **k ≈ 0.59**. Target **k = 1.00 ± 0.05**. N and E separately should stay correlated (stock r² ~0.95); a yaw swap is a different bug (`SENS_FLOW_ROT` / `paa3905 -Y 180`).

If k ≈ 0.59: node did not take the new image (check `/ufw`, `uavcan status`). If k ≈ 1.70² / 1 ≈ 2.9: double-scale (FMU `SENS_FLOW_SCALE` and node both 1.70, or CPI patch plus param). If k ≈ 1.13: only FC 1.5 cap applied — wrong place.

- [ ] **Step 4: Report**

Report k, r², lidar/ToF median while moving (should stay ~1.0 m), and whether D2 and D4 match.

---

## Self-review

- Spec coverage: node-side 1.70×, no shared PAA3905 CPI change, no FMU double-scale, Docker build target, board 87 flash, GPS-Doppler verify on FC time — all have tasks.
- Placeholders: none.
- Type consistency: param name `SENS_FLOW_SCALE`, value `1.70`, max `2.0`, target `holybro_h-flow_default`, board id 87.
