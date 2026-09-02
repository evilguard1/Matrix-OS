# MATRIX-OS Handoff

## Mission

MATRIX-OS is a staged, self-updating Bitburner automation system for **Steam
v3.0.1**. It must begin useful on a brand-new 8 GB save, grow only when Home
RAM and game APIs make the next module viable, preserve user configuration on
updates, and eventually coordinate all major Bitburner systems.

The user wants a genuine autonomous operating system with a polished Matrix
command interface. They explicitly do **not** want placeholder dashboards,
manual patch instructions, or claims that untested code is complete.

Repository: `https://github.com/evilguard1/Matrix-OS`

Current branch: `main`

Current published commit: `c04f5af2c4dbdacb221c7adc02acbcc019914898`

Current release/version: `0.3.0`

## Quick Start

Fresh Bitburner install:

```text
wget https://raw.githubusercontent.com/evilguard1/Matrix-OS/main/install.js install.js
run install.js --fresh
```

Update an installed copy:

```text
run /matrix/update.js
```

The updater resolves the GitHub `main` commit, then downloads every runtime
file from that immutable SHA. It preserves `/matrix/config.json`.

## Confirmed Behavior

These have been live-tested on a new, 8 GB Home save:

- The installer and in-game updater download the staged files successfully.
- The 8 GB bootstrap controller opens one lite tail, scans, roots reachable
  machines, and runs direct hack/grow/weaken work.
- Fresh-save money and hacking level increased while the bootstrap controller
  was active.
- Updating preserves configuration and resumes the controller.

Repository validation currently passes with `npm test`. It checks syntax for
every JS/JSX runtime file, manifest completeness/stage ordering, core pure
helpers, state-file extensions, and prohibited legacy/dev-only APIs.

## Architecture

| Home RAM | Stage | Entry point | Intended scope |
| --- | --- | --- | --- |
| 8 GB | `bootstrap` | `matrix/bootstrap.js` | One self-contained controller and lite tail |
| 16 GB | `early` | `matrix/early.js` | Distributed early workers and lite tail |
| 32 GB | `full` | `matrix/start.js` | Rooting, telemetry, HWGW, one full dashboard |
| 64 GB | `operations` | `matrix/start.js` | Purchased servers and Hacknet |
| 128 GB | `advanced` | `matrix/start.js` | Contracts, stocks, and Source-File-gated managers |

Important files:

- `install.js`: manifest-driven installer/updater and process cleanup.
- `manifest.json`: version, protected config, stage thresholds, deployable files.
- `matrix/kernel.js`: chooses the appropriate stage.
- `matrix/bootstrap.js`: deliberately standalone to remain viable at 8 GB.
- `matrix/early.js`: early distributed hacking stage.
- `matrix/start.js`: full-stage supervisor; deduplicates services and tails.
- `matrix/dashboard.jsx`: responsive full command deck, launched only at 32 GB+.
- `matrix/services/telemetry.js`: writes the single `overview.txt` snapshot
  consumed by the dashboard.
- `matrix/services/coordinator.js`: central cross-system progression coordinator.
  Evaluates player state, BitNode, karma, augmentations, and income to publish global objectives,
  reserve targets, and stock liquidation triggers.
- `matrix/lib/common.js`: config merge, release resolution, state/events,
  Source File helpers, coordinator state reader, cash reserves, and BitNode planner.

## Current UI

The current full dashboard is `matrix/dashboard.jsx`. It is a responsive,
single-tail Matrix command deck with Overview, Hacking, Economy, Progress, and
Settings views.

It deliberately uses CSS grid breakpoints rather than a fixed desktop-only
layout:

- 12 columns on wide tails.
- 6 columns below 1000px.
- One column below 620px.

Do not add another UI process for a service. The only full UI is the dashboard;
the 8 GB/16 GB stages have their own lightweight tails. `start.js` and the
dashboard both contain duplicate-process protection.

## Existing Automation

Implemented services include:

- Network discovery, port opening, rooting, and distributed workers.
- Target selection, preparation, and HWGW scheduling.
- Purchased-server and Hacknet purchasing under a common reserve.
- Coding contracts, stock trading, gang basics, sleeve basics, Bladeburner
  basics, and a conservative corporation bootstrap.
- Singularity: darkweb programs, faction invites, faction work, augmentation
  dependency ordering, faction donations after favor unlock, Home RAM upgrades,
  augmentation installation, and a shared augmentation-funding reserve.
- BitNode planning. World Daemon destruction remains disabled by default.

`matrix/services/singularity.js` was improved in `0.3.0` after studying the
architecture of Alain Bryden's MIT-licensed scripts. MATRIX does not vendor his
source. See `ATTRIBUTION.md`.

## Critical Constraints

- Target **Bitburner Steam v3.0.1** first. Check the official v3.0.1 Netscript
  definitions before adding an API. Feature-detect optional game systems.
- Never rely on dev-only UI APIs. The test suite rejects `ui.renderPage`.
- Use `ns.ui.closeTail()`, not the removed `ns.closeTail()` API.
- Bitburner only runs files with valid extensions. State files use `.txt` or
  `.json`; do not create state files with `.lock`.
- Preserve `/matrix/config.json` on normal updates. `--fresh` is the explicit
  configuration reset path.
- The 8 GB bootstrap must stay standalone: do not import shared modules into
  it, and do not add a dashboard/React dependency there.
- Services must be RAM-aware. The supervisor checks script RAM before launch
  and reserves enough RAM to process self-updates.
- Before Singularity is available, a fresh account cannot automate player work,
  travel, factions, augmentations, installations, or BitNode completion. That
  is a game API restriction, not a missing script.
- Do not claim full endgame autonomy without runtime tests on a save that has
  the relevant Source Files and unlocked systems.

## Prior Failure Modes

These have already caused user-visible breakage and must not return:

- Incorrect in-game paths such as `/matrix/matrix/kernel.js`.
- Multiple overlapping dashboard tails after updates/restarts.
- A GUI displaying telemetry while the actual hacking process was not running.
- Launching services that do not fit in free Home RAM.
- Stale spending-reserve state freezing the economy after Singularity stops.
- Fixed-layout dashboard panels overflowing narrow Bitburner tail windows.

The current augmentation reserve expires after 30 seconds if the Singularity
service stops. Keep that failure containment if the economy code changes.

## Honest Gap List

MATRIX has broad feature coverage, but it is **not** yet equivalent to the
complete mature autopilot systems it was inspired by. Do not overstate this.

Highest-value missing behavior:

1. A true cross-system progression coordinator. It should decide whether the
   current BitNode should prioritize hacking, faction reputation, a gang rush,
   Bladeburner, stock liquidity, corporation, or reset preparation.
2. Full faction-invite planning: travel, company work, karma/crime routes,
   city-faction selection, Daedalus timing, and donation strategy.
3. Mature hacking economics: profitability analysis, target switching based on
   real expected income, batch recovery, and coordination with special goals.
4. Advanced sleeves, gang equipment/training/territory policy, and full
   corporation product/division lifecycle.
5. Mature stock history/forecast strategy, stock liquidation for major goals,
   Hacknet hash-spending policy, casino/Stanek/Go/intelligence support.
6. End-to-end runtime tests for all advanced managers. Current live evidence is
   strongest for the fresh-save stages; later systems are syntax/API checked but
   not proven in every real game state.

## Recommended Next Work

Use proven public systems as references, but integrate deliberately rather than
copying a monolithic script into a RAM-constrained staged design.

1. Progression Coordinator (`matrix/services/coordinator.js`) has been implemented and tested, publishing global objectives, reserve targets, and stock liquidation commands.
2. Continue expanding manager policy consumption (e.g. Sleeve task assignment & Gang crime focus) based on `coordinator.txt` objectives.
3. Test one advanced manager at a time in a real compatible save before turning
   on automatic destructive actions such as installation or World Daemon exit.
4. Keep `progression.autoDestroyWorldDaemon` opt-in until the complete route
   planner is runtime-proven.

Other useful reference repository:

- `https://github.com/jjclark1982/bitburner-scripts`

## Working Rules For The Next Agent

- Read `README.md`, this file, `manifest.json`, `tests/validate.mjs`, and the
  relevant runtime service before changing behavior.
- Use `apply_patch` for source edits. Do not overwrite user configuration.
- Run `npm test` and `git diff --check` after every meaningful change.
- Keep a dirty worktree intact; do not reset/revert unrelated user changes.
- Commit and push only verified work to `main` when the user has asked for
  GitHub changes.
- Give the user the exact in-game command to update after publishing.
- Be candid about what is runtime-tested versus merely parsed/API-checked.

## Suggested Continuation Prompt

```text
Read HANDOFF.md and inspect the current MATRIX-OS repository before editing.
Continue the next highest-value item: build a compact advanced-stage progression
coordinator that adapts proven Bitburner autopilot policies while preserving the
staged RAM model, the single-dashboard rule, immutable manifest updates, and
Bitburner Steam v3.0.1 compatibility. Do not claim end-to-end behavior without
tests and a clear account of what was actually runtime-verified.
```
