# Native validation fixtures

These tests run against the official Bitburner 3.0.1 engine in an isolated browser profile. Never attach the harness to the player's Steam save or distribute it in the MatrixOS manifest.

1. Clone `https://github.com/bitburner-official/bitburner-src` at `3162fd2590e221eadd0c0fbd46151913f7c4c41c`. Install that project's dependencies.
2. Copy `ghost-harness.ts` from this directory to its `src/ghost-harness.ts`. Add `import "./ghost-harness";` to that test checkout's `src/index.tsx`. The harness disables Remote File API reconnection.
3. Build with `npx webpack --mode development`. Serve the **repository root**, which contains `index.html` and `dist`, at `http://127.0.0.1:8092/` (for example Python's HTTP server).
4. In the MatrixOS checkout, make Playwright available through `MATRIX_PLAYWRIGHT_PATH` (absolute module directory), or install it in an external test environment. The runners use headless Microsoft Edge.
5. Run `node tests/native/rp01.cjs`, then `node tests/native/rp02.cjs`. Results are written to `docs/rp/evidence/rp01/native.json` and `rp02/native.json`.

RP01 loads the distributed code, overrides only the economy config for a deterministic purchase, measures native script RAM in five node/SF contexts and verifies actual cash, one purchased server and a replayed receipt. Its config hash belongs to that synthetic config.

RP02 starts with only the installer and a protected test config. It intercepts repository requests with the current checkout's LF content under a synthetic immutable SHA. Five isolated contexts verify native downloads, hashing, file writes, preserved config and compiled payloads. It uses `--no-start`; subsequent service health is outside this proof.

The harness changes RAM, cash and node/SF fields for test purposes. Those synthetic configurations do not simulate completing a node, applying every node multiplier or acquiring Source-Files. No end-to-end campaign certification follows from these tests.
