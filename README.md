# MATRIX-OS

MATRIX-OS is a staged autonomous control system for **Bitburner Steam v3.0.1**. It starts as one RAM-safe fresh-save process, then downloads and activates more of the system as Home RAM makes each stage useful.

## First install

Run these two commands in the Bitburner terminal:

```text
wget https://raw.githubusercontent.com/evilguard1/Matrix-OS/main/install.js install.js
run install.js --fresh
```

The installer validates `manifest.json`, downloads only the stage the current Home can support, and starts `/matrix/kernel.js`. A fresh 8 GB save should then show exactly one lightweight MATRIX window and begin scanning, rooting, growing, weakening, and hacking automatically.

## Update

With MATRIX running:

```text
run /matrix/update.js
```

The tiny update command queues a cache-busted GitHub update. The active stage safely downloads the new installer, preserves `/matrix/config.json`, closes its current tail, updates the eligible stage, and restarts through the kernel.

If MATRIX was manually stopped before the update request, start the queued update with:

```text
run /matrix/kernel.js
```

To deliberately replace the saved configuration with repository defaults:

```text
run install.js --fresh
```

## RAM stages

| Home RAM | Active stage | Behavior |
| ---: | --- | --- |
| 8 GB | Bootstrap | One self-contained process, lite Matrix tail, network discovery/rooting, direct hack/grow/weaken |
| 16 GB | Early | Distributed early workers and lite Matrix tail |
| 32 GB | Full | Root service, telemetry, adaptive HWGW scheduler, full React dashboard |
| 64 GB | Operations | Purchased-server cloud and Hacknet managers |
| 128 GB+ | Advanced | Contracts, stocks, and feature-gated progression managers |

Stage changes are automatic. When Home crosses a boundary, the current process downloads the newly eligible manifest files and restarts into the next stage. Services also check their exact script RAM before launch, so a Source-File API with a large RAM multiplier waits until it actually fits.

## Automation coverage

- Recursive network discovery and automatic port opening/rooting
- Fresh-save hacking and 16 GB distributed workers
- Adaptive target selection, prep, and HWGW batching
- Purchased-server and Hacknet investment within configured reserves
- Safe coding-contract solvers; unsupported types are skipped without consuming attempts
- WSE/TIX/4S acquisition and forecast-based stock trading
- Singularity faction work, programs, Home RAM, augment purchases, and controlled resets
- Gang recruiting, ascension, assignments, and territory warfare
- Sleeve recovery, synchronization, crime, study, and augmentation purchasing
- Bladeburner joining, action selection, stamina/chaos recovery, and skill upgrades
- Conservative corporation creation and Agriculture bootstrap
- BitNode route planning with an explicit World Daemon safety switch
- Central telemetry, event history, settings, and full Matrix dashboard

Bitburner does not expose player-action automation on a truly fresh account until Singularity access is unlocked through Source-File 4 or the current BitNode. MATRIX automates everything the installed game APIs permit and keeps unavailable managers gated instead of calling locked APIs.

## Configuration and safety

Configuration lives at:

```text
/matrix/config.json
```

Updates preserve this file. Older installations using `/matrix/config.txt` are migrated automatically.

`progression.autoDestroyWorldDaemon` defaults to `false`. MATRIX still calculates and displays the next planned BitNode, but it will not leave the current BitNode until that setting is intentionally enabled.

## Compatibility

The implementation targets the API surface in the official **Bitburner v3.0.1** source, including `ns.ui.closeTail()` and the v3 `ns.cloud` namespace. Dev-only APIs are not required. Optional game systems are checked through Source Files and runtime availability before launch.

## Repository layout

```text
install.js                 manifest installer and updater
manifest.json              versioned files and RAM stages
matrix/kernel.js           tiny stage selector
matrix/bootstrap.js        standalone 8 GB controller and lite UI
matrix/early.js            16 GB distributed controller and lite UI
matrix/start.js            32 GB+ service supervisor
matrix/dashboard.jsx       full Matrix dashboard
matrix/update.js           low-RAM update request
matrix/config.json         preserved user configuration
matrix/lib/                shared utilities
matrix/services/           autonomous managers
matrix/workers/            hacking workers
```

Repository validation:

```text
npm install
npm test
```

The validator checks JavaScript/JSX syntax, manifest completeness and dependency stages, pure scheduler helpers, legacy API regressions, and required files.
