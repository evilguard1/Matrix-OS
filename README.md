# MATRIX-OS

**MATRIX-OS** is an autonomous control system for **Bitburner 3.0.1+**. The goal is not just to automate hacking, but to provide one coherent system that can grow from a fresh save toward endgame while exposing its decisions through a Matrix-style control dashboard.

> Current status: **v0.1.3 / active prototype**. The project is usable, but it is still being tested against a live fresh save. Do not treat every endgame manager as mathematically optimal yet.

## Install directly from GitHub

From the Bitburner terminal:

```text
wget https://raw.githubusercontent.com/evilguard1/Matrix-OS/main/install.js install.js
run install.js --fresh
```

That downloads the complete `/matrix/` system and launches it.

## Update later

Once MATRIX-OS is installed:

```text
run /matrix/update.js
```

The updater fetches the newest GitHub installer, replaces the full MATRIX codebase, **preserves your `config.txt`**, stops stale runtime processes, and restarts the system.

To intentionally reset the configuration to repository defaults:

```text
run install.js --fresh
```

## Architecture

```text
MATRIX dashboard
      │
      ▼
telemetry / state
      │
      ▼
MATRIX runtime
 ├─ root + discovery
 ├─ hacking scheduler
 ├─ cloud
 ├─ Hacknet
 ├─ contracts
 ├─ stocks
 ├─ Singularity
 ├─ gang
 ├─ sleeves
 ├─ Bladeburner
 └─ corporation
      │
      ▼
distributed workers
```

The dashboard is deliberately separate from the automation. Closing the dashboard does not stop the backend.

## Current features

- Network discovery and automatic rooting
- Fresh-save low-RAM bootstrap
- Distributed early-game hacking
- Automatic transition into adaptive HWGW
- Target scoring and automatic target switching
- Adaptive hack-fraction search
- RAM-aware distributed execution
- Bitburner 3.x `ns.cloud` purchased-server management
- Hacknet investment and hash handling
- Safe coding-contract solver set; unsupported contracts are skipped
- Stock manager for WSE/TIX/4S progression
- Singularity automation when available
- Gang manager
- Sleeve manager
- Bladeburner manager
- Conservative Corporation bootstrap
- Central telemetry and event stream
- React Matrix dashboard
- Bitburner 3.0.1 dashboard fallback using React in a large tail window
- GitHub-native one-command updater

## Version compatibility

The live test machine currently runs **Bitburner v3.0.1 (3162fd2)**. MATRIX-OS therefore avoids assuming that APIs appearing only in the current `dev` documentation exist in 3.0.1.

For example, the dashboard detects `ns.ui.renderPage()` when available, but falls back to `ns.printRaw()` + `ns.ui.openTail()` on 3.0.1.

## Safety

`autoDestroyWorldDaemon` is disabled by default. Automatic BitNode selection/destruction is intentionally held back until the progression planner is validated on real runs.

Corporation logic is currently conservative. The hacking/rooting/telemetry layers are more mature than the high-level endgame planners.

## Project direction

The target is a system where the player can launch MATRIX-OS, watch the cyber empire operate from one interface, understand *why* it is making decisions, override priorities when desired, and otherwise let the automation progress the game.

## Repository layout

```text
install.js              GitHub installer/updater entry point
matrix/
  start.js              launcher/director
  bootstrap.js          tiny-RAM early-game bootstrap
  dashboard.jsx         Matrix UI
  update.js             self-updater
  config.txt            configuration
  lib/                   shared utilities
  services/              autonomous managers
  workers/               RAM-light hack/grow/weaken workers
  state/                 runtime-generated telemetry (not stored in Git)
```

## Development rule

When a fix is made, the full corrected file is committed here. Users should update with `/matrix/update.js`; they should not have to manually hunt through large scripts and patch individual lines.
