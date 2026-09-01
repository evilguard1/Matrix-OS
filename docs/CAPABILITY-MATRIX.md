# MATRIX-OS Capability Matrix

Audit of the current implementation against the mature public Bitburner
autopilots it draws ideas from, plus the concrete next-work queue. Keep this file
current when a capability moves between columns.

References:
- `alain` = https://github.com/alainbryden/bitburner-scripts
- `jjclark` = https://github.com/jjclark1982/bitburner-scripts

Status legend: **Solid** = keep as-is · **Basic** = works but well short of the
reference · **Missing** = not implemented.

---

## Solid — keep

| Area | File | Notes |
| --- | --- | --- |
| Self-propagating 8 GB botnet | `matrix/worm/` | Worm seeds itself onto the network and grows without home RAM - see below |
| Staged manifest install / update | `install.js` | SHA-pinned downloads, config preservation, atomic download-then-swap, recover-to-previous-version on any failed download |
| Kernel stage selection | `matrix/kernel.js` | Picks the RAM-appropriate stage, kills stale stage processes, clears the bootstrap lock |
| Network discovery + rooting | `matrix/lib/network.js`, `matrix/services/root.js` | BFS scan, port-opener detection, `nuke`, worker `scp` |
| HWGW batch engine | `matrix/services/hacking.js` | Self-tunes batch shape by expected-$ / RAM-second, prep phase, RAM-gated backoff |
| Economy reserve protocol | `matrix/lib/common.js` `reserveMoney()` | Merges coordinator + Singularity reserves, expires stale reserves so a crashed service cannot freeze spending |
| Objective evaluation (pure) | `matrix/services/coordinator.js` `evaluateObjective()` | 10 prioritised objective tiers, unit-tested |
| Directive / budget protocol (pure) | `matrix/services/coordinator.js` `planDirectives()` | Per-manager directives + discretionary budgets, unit-tested — see below |
| Stock trader | `matrix/services/stock.js` | 4S forecast long/short, conviction sizing, weak-position exit, coordinator-driven liquidation and hold |
| Singularity aug logic | `matrix/services/singularity.js` | Aug valuation/scoring, prereq ordering, buy-expensive-first, favor-gated donations, TOR/programs, Home RAM |
| Single telemetry writer + React deck | `matrix/services/telemetry.js`, `matrix/dashboard.jsx` | One `overview.txt` writer, duplicate-guarded dashboard, 3 responsive breakpoints |

## Basic — exists but short of the reference

| Area | Gap | Reference | Stage / SF |
| --- | --- | --- | --- |
| 16 GB early | Distributes a loop worker to one target, no batching | alain `daemon.js` XP mode | early / 16 GB |
| Coordinator scope | Emits one global objective + directives + budgets, but only some managers consume it (see table below). No per-BitNode strategy switch, no manager enable/disable by phase. | alain `autopilot.js` | full / 64 GB start gate |
| Hacking target selection | Single target, wave-based (`waitPids` each cycle leaves duty-cycle gaps), no multi-target pipeline, no `ns.share()` | alain `daemon.js` | full / 32 GB |
| Sleeves | Task ladder + directive support; no per-task gain optimisation, no company work, minimal aug purchasing | alain `sleeve.js` | advanced / SF10 |
| Gang | Task scoring + ascension at 1.8x + warfare at >62% clash + directive mode; no equipment purchasing | alain `gangs.js` | advanced / SF2 |
| Bladeburner | EV action scoring, stamina/chaos handling, BlackOp at >=90%, skill priority; no population/estimate actions, no city hopping | alain `bladeburner.js` | advanced / SF6-7 |
| Corporation | Agriculture-only bootstrap, fixed job ratios, accepts investment rounds <=2; no product division, no second industry | jjclark corp; alain | advanced / SF3 or $150B self-fund |
| Hacknet | Cheapest upgrade within the budget fraction; sells hashes for money at 80% capacity only | alain `hacknet-upgrade-manager`, `spend-hacknet-hashes` | full / 32 GB |
| Contracts | 20 solvers, unknown types skipped safely; ~10 types unsolved | jjclark solvers | advanced / 128 GB |
| Cloud (pserv) | Buy within the budget fraction, double the weakest server; no purchase-curve tuning | alain `host-manager` | operations / 64 GB |
| `progression.js` | Only plans the next BitNode and (opt-in) destroys the World Daemon | alain `autopilot.js` reset logic | advanced / 128 GB |

## Missing

| Missing | Reference | Stage / SF |
| --- | --- | --- |
| Faction-invite route planner: travel, backdoor `CSEC` / `avmnite-02h` / `run4theh111z` / `I.I.I.I` / `.` , company work for megacorp factions, Netburners / Tian Di Hui requirements | alain `work-for-factions.js` | advanced / SF4 |
| Backdoor installer (`singularity.installBackdoor`) on faction and story servers | alain | advanced / SF4 |
| `ns.share()` for faction-rep boost while working | alain `daemon.js --share` | full / 32 GB |
| NeuroFlux Governor farming at reset (buy all affordable NFG levels before install) | alain `faction-manager` | advanced / SF4 |
| Reset-value estimation (is installing worth it — total rep-to-aug and money multiplier, not just queued-aug count) | alain `faction-manager` | advanced / SF4 |
| Per-BitNode strategy switch (BN2 gang-first, BN6/7 bladeburner, BN8 stocks-only, BN9 hacknet servers, BN13 Stanek). Plan array exists; no behaviour switch. | alain `autopilot.js` | advanced |
| Formulas API exact batch math when SF5 is present | alain `daemon.js` | full / 32 GB, SF5 |
| Continuous / pipelined HWGW batcher with multi-target scheduling | alain `daemon.js` | full / 32 GB |
| Casino seed ($10b blackjack), Stanek's Gift, IPvGO (`ns.go`), intelligence farm | alain `casino` / `stanek` / `go` | advanced / various SF |
| Pre-4S momentum stock trading (history buffer + EMA forecast) | alain `stockmaster.js` | advanced / 128 GB |

---

## The 8 GB worm (self-propagating botnet)

Home at 8 GB cannot orchestrate a botnet. `bootstrap.js` already carries `wget`,
`spawn`, `ps`, `rm` and all five port crackers, so `scp` (0.6 GB) plus `exec`
(1.3 GB) do not fit alongside it — that is why the earlier "deploy workers from
the 8 GB stage" attempt had to be reverted.

The worm inverts the problem: the propagation logic runs **on the infected
hosts**, not on home. Home's steady-state cost for the entire botnet is zero.

| File | RAM | Role |
| --- | ---: | --- |
| `matrix/worm/seed.js` | 6.20 GB | One-shot. Launched by the kernel below 16 GB. Roots what it can reach, plants the worm on the largest rootable server, then `spawn`s the real stage so home is freed. |
| `matrix/worm/spread.js` | 5.05 GB | Resident on infected hosts. Each cycle: root neighbours, `scp` the worm onward, promote hosts >= 16 GB to propagation nodes, fill everything else with drones, retarget when the best target changes. |
| `matrix/worm/drone.js` | 2.40 GB | The earner. One target, `weaken` / `grow` / `hack` forever. Small enough that a 4 GB node (`n00dles`) carries one. |

Propagation on a fresh save works immediately: `foodnstuff`,
`sigma-cosmetics` and `joesguns` are 16 GB, need zero open ports, and require
hacking level 1, so the first seed lands within seconds of starting the game.

Growth is `home -> biggest rootable host -> its neighbours -> ...`. Every host
with >= 16 GB becomes a propagation node and reserves 5.05 GB for the worm; the
remaining RAM, and all of every smaller host, becomes drones. `preventDuplicates`
on `exec` makes each cycle idempotent, and `scriptKill` only fires when the best
target actually changes, so in-flight work is not thrown away.

### RAM budgets are enforced, not documented

`tests/ram-budget.mjs` is a static Netscript RAM analyser. Bitburner charges a
script for every NS function it *mentions* plus a 1.6 GB base, and a script that
does not fit simply never launches — silently. The validator therefore asserts:

- `drone` fits a 4 GB server
- `spread + drone` fits an 8 GB server
- `seed` fits an 8 GB home
- the `SPREAD_RAM` / `DRONE_RAM` constants the worm hardcodes (it cannot afford
  `ns.getScriptRam`, 0.1 GB) match the measured cost exactly
- no worm file uses an NS function with an unknown RAM cost
- no worm file `import`s anything (import RAM is billed to the caller)

Adding a single `ns.getServer()` (2.0 GB) to `spread.js` fails the suite with
`spread + drone must fit 8 GB, is 9.45 GB`. The regression that cost the first
attempt cannot recur silently.

### Scope and lifecycle

The worm is active **below 16 GB only**. From 16 GB `early.js` distributes
workers directly, and from 32 GB the HWGW batcher in `hacking.js` schedules the
same RAM far more efficiently — running both would just make them compete. The
worm files are listed in `install.js`'s `MATRIX_PROGRAMS`, so the installer's
process sweep retires the botnet from every host on a stage transition.

Follow-up: replacing `early.js`'s home-orchestrated deployment with the worm
would free ~2.6 GB of home RAM at the 16 GB stage too.

---

## Directive / budget protocol (`/matrix/state/directives.txt`)

`coordinator.js` writes this file every cycle. `planDirectives(data)` is a pure
function (tested in `tests/validate.mjs`). `coordinator.txt` is unchanged and
still drives `reserveMoney()` and the dashboard mission board.

```
{ updated, phase, objectiveId, liquidateStocks,
  budgets:    { hacknet, cloud, stock, corporation, sleeveAugs, homeRam },   // spend fractions of (cash - reserve)
  directives: { hacking:     "money" | "xp",
                sleeves:     "money" | "karma" | "rep:<Faction>",
                gang:        "idle" | "balanced" | "respect" | "money",
                singularity: "rep" | "programs" | "augs",
                bladeburner: "rank" | "blackops",
                stock:       "trade" | "hold" | "liquidate" } }
```

### Phases

| Phase | Trigger objective | Intent |
| --- | --- | --- |
| `BOOTSTRAP` | `BUY_PROGRAMS`, or `BOOTSTRAP_INCOME` under 32 GB Home | Rush hacking XP + port programs + Home RAM |
| `HACK_ECON` | `BOOTSTRAP_INCOME` at 32 GB+, `EXPAND_RAM` | Steady-state income and infrastructure growth |
| `KARMA_GANG` | `GANG_KARMA` | All sleeves on homicide for the -54k karma gang unlock |
| `FACTION_REP` | `FACTION_REP`, `LIQUIDATE_STOCKS` | Grind reputation for the target augmentation |
| `MILESTONE` | `RESERVE_MILESTONE` | Hoard cash for Daedalus / Corporation; starve discretionary spend |
| `AUG_RESET` | `INSTALL_AUGMENTATIONS` | Liquidate, stop faction work, buy queued augs, reset |
| `ENDGAME` | `W0R1D_D43M0N`, `THE_RED_PILL` | Everything toward BitNode exit |

### Consumption status

| Signal | Consumer | Status |
| --- | --- | --- |
| `directives.hacking` (`xp`) | `hacking.js`, `early.js` target selection | **Live** |
| `directives.sleeves` | `sleeves.js` task assignment | **Live** |
| `directives.gang` | `gang.js` task-scoring mode | **Live** |
| `directives.singularity` | `singularity.js` spend / faction-work focus | **Live** |
| `directives.stock` | `stock.js` trade / hold / liquidate | **Live** |
| `budgets.hacknet` / `.cloud` / `.stock` | `hacknet.js`, `cloud.js`, `stock.js` via `managerBudget()` | **Live** |
| `budgets.sleeveAugs` | `sleeves.js` aug purchasing | **Live** |
| `directives.bladeburner` | `bladeburner.js` | Published, not yet consumed |
| `budgets.corporation` / `.homeRam` | — | Published, not yet consumed |

A missing or stale (`> 30 s`) `directives.txt` makes every consumer fall back to
its own local default, so removing the coordinator is always safe.

---

## Recommended next work (in priority order)

1. **`ns.share()` faction-rep mode** in `hacking.js`, driven by a new
   `directives.hacking = "share"` value, reserving a RAM fraction for share
   workers while a `FACTION_REP` / `ENDGAME` phase is active.
2. **Backdoor + faction route planner** (`singularity.installBackdoor`, travel,
   company work) as `matrix/services/factions.js`, consuming `directives.singularity`.
3. **Reset-value estimation** in `singularity.js` / `progression.js`: replace the
   pure queued-aug count with a rep-and-money-multiplier estimate.
4. **Move the 16 GB stage onto the worm** so `early.js` stops spending ~2.6 GB
   of home RAM orchestrating workers the botnet can place itself.
5. **Per-BitNode strategy** table in the coordinator that reprioritises managers
   and the `bitNodePlan`.
6. Wire `budgets.corporation` / `budgets.homeRam`, then expand the corporation
   and bladeburner managers.
