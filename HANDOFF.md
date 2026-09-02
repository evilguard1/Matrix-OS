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

Current published commit: see `git log -1 --format=%H` on `main`.

Current release/version: `0.8.5`

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

### 0.8.3 verification status

0.8.2's singleton made the problem WORSE - six decks instead of three - and the
reason is worth recording permanently:

**`ns.kill(pid)` terminates the victim instantly, so the victim never runs its
own `closeTail()`.** Closing another script's tail by PID is not reliable, so
"owner kills duplicates" produces a dead process behind a window that nothing can
subsequently close. Orphaned windows accumulate.

The rule is now voluntary stand-down: lowest PID wins, and every other instance
notices on its next poll, closes ITS OWN tail - which always works - and returns.
Nobody kills anybody. `matrix/lib/singleton.js` has no `ns.kill`, and a test
asserts it never gains one.

The restart storm behind it is also fixed. A stage transition restarts the whole
system, and it was retried every 5 s; if the transition never "takes" that is an
infinite restart loop leaving a new deck behind each cycle. Transitions are now
gated to one attempt per 5 minutes, persisted in `stage-attempt.txt`, and a stuck
stage is reported in the supervisor state and tail instead of retried forever.

All three guards are regression-tested and each was verified to FAIL when the
fix is reverted: the singleton gaining an `ns.kill`, the stage transition losing
its time gate, and the deck checking ownership only at startup. Two earlier
versions of the last two assertions were too weak to bite and were strengthened.

Orphaned tail windows from before this fix cannot be closed programmatically -
close them once by hand.

### 0.8.2 verification status

"Multiple overlapping dashboard tails" - a documented prior failure mode -
returned as soon as the deck could actually launch again. Three live decks, and
six `MATRIX full supervisor online` events in ten minutes with two of them a
second apart.

The guards were startup-only and passive: each process checked once for an
*older* instance and then never looked again. Two supervisors restarting a second
apart therefore each saw nothing and both survived, and each launched its own
deck. `kernel.js` also swept the stage scripts but not `dashboard.jsx`, so a
relaunch left the old deck on screen.

`matrix/lib/singleton.js` replaces both guards with a total, stable rule: lowest
PID wins, the owner actively evicts duplicates, losers stand down. Because the
ordering is total it converges and cannot oscillate. It is re-asserted every
2 s in the deck and every supervisor cycle, not merely at startup, and
`kernel.js` now sweeps the deck too.

Regression-tested in `tests/integration.mjs`: three racing decks collapse to the
lowest PID, a late arrival stands down, the owner keeps ownership, and a lone
deck survives. Verified to fail when the eviction is removed.

### 0.8.1 verification status

The command deck never launched at 32 GB. `RamCostConstants.Dom` is **25**, and
Bitburner charges it statically the moment a script *mentions* `window` or
`document` - whether or not the line runs. One `window.innerWidth` in the
decorative matrix-rain canvas made `dashboard.jsx` **26.9 GB** instead of 1.9, so
`ensureOne()` refused it and, because `start.js` had no UI of its own, the player
was left with no window and no explanation.

Fixed three ways:
- the canvas sizes itself from its own element via a React ref, no DOM
  identifiers, so the deck is back to 1.9 GB;
- the RAM analyser prices the DOM, and the validator now fails any runtime file
  that touches `window`/`document` (verified to bite on reintroduction);
- `start.js` opens its own supervisor tail whenever the deck is NOT running,
  listing every service and why it is not up. It costs 0 GB - print, tail and
  ui are all free - and it closes itself when the deck comes back.

The deeper lesson is recorded in the capability matrix: a static RAM analyser
that only looks at `ns.*` is incomplete, because Bitburner also prices DOM
access and imported modules.

### 0.8.0 verification status

Coding contracts are split the way the worm splits propagation. Solving costs
20 GB of API (`attempt` 10 + `getData` 5 + `getContractType` 5), which would keep
contracts behind a 128 GB home. `matrix/lib/dispatch.js` (4.45 GB) only finds
them; `matrix/workers/contract.js` (21.6 GB) is a one-shot solver sent to a
network host. `early.js` already owns scp and exec, so it dispatches contracts
for the price of `ls` - **contracts now work from the 16 GB stage**.

The integration harness earned itself here. The worm saturates the network by
design, so no host had 21.6 GB free and contracts would never have run:
`{ found: 2, sent: 0, waiting: 2 }`. `makeRoom()` now evicts drones from the
largest capable host; verified 36 drones -> solver lands on zer0 -> 25 drones,
with the worm refilling on its next cycle. `CodingContractBaseMoneyGain` is
$75m x difficulty, so the trade is heavily in our favour.

The RAM analyser now follows `/matrix/...` imports, because Bitburner bills an
import's RAM to the importer. Several earlier figures were understated by up to
3.15 GB; the stage table was re-derived from the corrected numbers, and
`root.js` moved to 64 GB (the worm roots continuously, and hacking.js scp's its
own workers, so it is redundant below that).

Contract attempts are finite, so the worker returns WITHOUT attempting on an
unknown type or a throwing solver, and the dispatcher never sends the same
contract twice. Both are asserted.

Still NOT runtime-tested in Bitburner: the 32 GB+ stage as a whole, contract
dispatch against real `.cct` files, the relaxed service gates on a Source-File
save, and `ns.share()`.

### 0.7.0 verification status

RAM costs are now verified against bitburner-src `RamCostGenerator.ts` rather
than estimated. The headline: `SF4Cost()` multiplies every Singularity call by
**16** below SF4 level 3, so `singularity.js` measures **1242 GB** without it and
80 GB with it, and `corporation.js` is **342 GB** of CorporationAction calls.
`coordinator.js` used to make eight speculative Singularity calls in try/catch -
Bitburner charges that RAM statically whether or not the Source File exists, so
it could never have run. It now reads the state files those services publish and
measures 2.45 GB.

The service table in `start.js` declares Home RAM per manager, and `npm test`
asserts each `minRam` still exceeds the measured cost plus the update reserve,
so the stage model cannot drift back into fiction.

`tests/mock-ns.mjs` is a fake Netscript that enforces real RAM, and
`tests/integration.mjs` runs the actual worm against it. Verified to catch both
a stale `DRONE_RAM` constant and a missing relay reserve. This is the first
integration coverage in the project; every prior failure was an integration bug
that parsed cleanly.

Still NOT runtime-tested in Bitburner: the 32 GB+ stage as a whole, the relaxed
service gates on a save with Source Files, and `ns.share()`.

### 0.6.0 verification status

`matrix/lib/capabilities.js` computes Home RAM and purchased-server prices from
Bitburner's own formulas; `tests/validate.mjs` pins them against known values and
asserts no manual action can overflow its HUD column, that every box line renders
to an identical width, and that `bestServerBuy` never returns a server too small
to host a worker. Singularity is feature-detected through `getResetInfo()` (0 GB).
The relaxed service gates rely on `ensureOne()`'s existing RAM-fit check; that
path is unchanged but the wider set of services it now admits has NOT been
runtime-tested on a save with Source Files.

### 0.5.0 verification status

The worm's RAM budgets are *computed* from the Netscript cost table and
asserted exactly (`drone` 2.40 GB, `spread` 5.05 GB, `seed` 6.20 GB one-shot),
including that the constants the worm hardcodes match the measured values.
Injecting a single `ns.getServer()` into `spread.js` fails the suite. The
propagation and drone *behaviour* has NOT been run inside Bitburner - treat
throughput claims as untested until you watch it on a real 8 GB save.

### 0.4.0 verification status

The coordinator directive/budget protocol (`planDirectives()`) is covered by
deterministic scenario tests in `tests/validate.mjs` (bootstrap, karma/gang,
faction-rep, milestone, aug-reset, endgame, steady-state). The consumer wiring in
`sleeves`, `gang`, `stock`, `singularity`, `hacking`, `early`, `hacknet`, and
`cloud` is written to be a no-op when `directives.txt` is absent or stale, and
was **not** yet runtime-tested in a save with Source-File 4 / gangs / sleeves.
Treat the advanced-manager behaviour changes as API-checked, not proven.

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
- `matrix/worm/{seed,spread,drone}.js`: the self-propagating 8 GB botnet.
  Home cannot afford `scp`+`exec` alongside the bootstrap controller, so the
  propagation logic runs on the infected hosts instead. `seed.js` is one-shot
  from the kernel below 16 GB; `spread.js` is resident on hosts >= 16 GB and
  grows the botnet; `drone.js` is the 2.4 GB earner that fits even n00dles.
  RAM budgets are asserted by `tests/ram-budget.mjs`, not merely documented.
- `matrix/early.js`: early distributed hacking stage.
- `matrix/start.js`: full-stage supervisor; deduplicates services and tails.
- `matrix/dashboard.jsx`: responsive full command deck, launched only at 32 GB+.
- `matrix/services/telemetry.js`: writes the single `overview.txt` snapshot
  consumed by the dashboard.
- `matrix/services/coordinator.js`: central cross-system progression coordinator.
  Evaluates player state, BitNode, karma, augmentations, and income to publish global objectives,
  reserve targets, and stock liquidation triggers. `evaluateObjective()` picks the global
  objective; `planDirectives()` translates it into the per-manager directive/budget
  protocol at `/matrix/state/directives.txt`. Both are pure and unit-tested.
- `matrix/lib/common.js`: config merge, release resolution, state/events,
  Source File helpers, coordinator state reader, cash reserves, BitNode planner,
  `getDirectives()`, and `managerBudget()` (directive-aware discretionary spend).
- `docs/CAPABILITY-MATRIX.md`: audit vs. the public reference autopilots, the
  directive protocol spec and consumption status, and the prioritised next-work queue.

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

1. Progression Coordinator (`matrix/services/coordinator.js`) publishes global
   objectives, reserve targets, stock liquidation commands, and (0.4.0) the
   per-manager directive/budget protocol at `/matrix/state/directives.txt`.
   `sleeves`, `gang`, `stock`, `singularity`, `hacking`, `early`, `hacknet`, and
   `cloud` consume it. `bladeburner` and the `corporation`/`homeRam` budgets are
   published but not yet consumed.
2. Next: `ns.share()` rep mode; a backdoor + faction route planner; reset-value
   estimation; then the 8 GB bootstrap distribution retry. See
   `docs/CAPABILITY-MATRIX.md` for the full queue.
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
