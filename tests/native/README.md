# Native validation fixtures

These tests run against the official Bitburner 3.0.1 engine in an isolated browser profile. Never attach the harness to the player's Steam save or distribute it in the MatrixOS manifest.

1. Clone `https://github.com/bitburner-official/bitburner-src` at `3162fd2590e221eadd0c0fbd46151913f7c4c41c`. Install that project's dependencies.
2. Copy `ghost-harness.ts` from this directory to its `src/ghost-harness.ts`. Add `import "./ghost-harness";` to that test checkout's `src/index.tsx`. The harness disables Remote File API reconnection.
3. Build with `npx webpack --mode development`. Serve the **repository root**, which contains `index.html` and `dist`, at `http://127.0.0.1:8092/` (for example Python's HTTP server).
4. In the MatrixOS checkout, make Playwright available through `MATRIX_PLAYWRIGHT_PATH` (absolute module directory), or install it in an external test environment. The runners use headless Microsoft Edge.
5. Run `node tests/native/rp01.cjs`, then `node tests/native/rp02.cjs`. Results are written to `docs/rp/evidence/rp01/native.json` and `rp02/native.json`.
6. Run `node tests/native/rp05.cjs` for the full supervisor plus two Singularity cycles on a synthetic BN4 64GB home with CyberSec membership. This writes `docs/rp/evidence/rp05/native.json`. Its economy config disables augmentation installation for this fixture, and RAM peaks are sampled every 250ms.

RP01 loads the distributed code, overrides only the economy config for a deterministic purchase, measures native script RAM in five node/SF contexts and verifies actual cash, one purchased server and a replayed receipt. Its config hash belongs to that synthetic config.

RP02 starts with only the installer and a protected test config. It intercepts repository requests with the current checkout's LF content under a synthetic immutable SHA. Five isolated contexts verify native downloads, hashing, file writes, preserved config and compiled payloads. It uses `--no-start`; subsequent service health is outside this proof.

The harness changes RAM, cash and node/SF fields for test purposes. Those synthetic configurations do not simulate completing a node, applying every node multiplier or acquiring Source-Files. No end-to-end campaign certification follows from these tests.

7. Run `node tests/native/early.cjs` to verify 16 → 32 → 64 GB and 32 → 64 GB from early-only files, including native TOR/BruteSSH purchases at 32 GB and automatic pinned full-stage install/start. The harness supplies cash for speed; the scripts perform the actual purchases. This proves transitions, not time to earn money. Output: `docs/rp/evidence/early/native.json`.

8. Run `node tests/native/backdoors.cjs` for native CSEC interruption/retry, terminal return, actual invitation/join and faction work. The harness supplies hacking XP and CSEC root/security, but does not supply its backdoor or membership. Output: `docs/rp/evidence/backdoors/native.json`.

9. Run `node tests/native/control.cjs` for native pause/replay/resume at 8 GB BN1 and 32/64 GB BN4. The fixture supplies hacking XP/root and CyberSec membership only at 64 GB, then verifies actual faction work, native drainage and foreign process preservation. The foreign loop is started after faction work at 64 GB because its extra RAM is outside the core admission budget. Output: `docs/rp/evidence/control/native.json`. `CONTROL_RAM` can select one diagnostic case; remove it for the three-case release proof.

10. Run `node tests/native/briefing.cjs` for native French/JSON report collection at 32/64 GB, measured RAM and rejection of an objective whose stage owner was stopped without removing the recent state. Output: `docs/rp/evidence/briefing/native.json`.
