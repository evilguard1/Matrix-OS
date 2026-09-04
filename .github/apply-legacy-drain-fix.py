from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one marker, found {count}")
    p.write_text(text.replace(old, new, 1))


replace_once(
    "matrix/services/hacking.js",
    '''    shareArgs,
    shareCapacityThreads,
    shareProcessMeta,
} from "/matrix/lib/reputation-boost.js";''',
    '''    shareArgs,
    shareCapacityThreads,
    shareProcessMeta,
    sameScriptPath,
} from "/matrix/lib/reputation-boost.js";''',
)

replace_once(
    "matrix/services/hacking.js",
    '''        for (const proc of processes) {
            if (![H, G, W].includes(proc.filename)) continue;
            if (trackedPids.has(proc.pid)) continue;''',
    '''        for (const proc of processes) {
            // Bitburner's ns.ps() normalizes filenames (notably dropping the
            // leading slash). After a hacking-service restart, surviving H/G/W
            // children therefore have to be reconstructed with normalized path
            // matching before MAX can consider the drain complete.
            if (![H, G, W].some(script => sameScriptPath(proc.filename, script))) continue;
            if (trackedPids.has(proc.pid)) continue;''',
)

replace_once(
    "tests/reputation-boost.mjs",
    '''    shareCapacityThreads,
    shareProcessMeta,
} from "../matrix/lib/reputation-boost.js";''',
    '''    shareCapacityThreads,
    shareProcessMeta,
    sameScriptPath,
} from "../matrix/lib/reputation-boost.js";''',
)

marker = '''assert.equal(isOwnedShareProcess({ ...owned, filename: "/matrix/workers/other.js" }, "boost-a"), false,
    "ownership matching must remain script-specific");
'''
replace_once(
    "tests/reputation-boost.mjs",
    marker,
    marker + '''assert.equal(sameScriptPath("matrix/workers/hack.js", "/matrix/workers/hack.js"), true,
    "legacy H/G/W reconstruction must tolerate ns.ps dropping the leading slash");
assert.equal(sameScriptPath("\\\\matrix\\\\workers\\\\grow.js", "/matrix/workers/grow.js"), true,
    "legacy H/G/W reconstruction must tolerate normalized separators");
assert.equal(sameScriptPath("matrix/workers/share.js", "/matrix/workers/weaken.js"), false,
    "legacy reconstruction must remain worker-script-specific");
''',
)

replace_once(
    "tests/reputation-boost.mjs",
    '''assert.match(hacking, /maxBoostReady/);
assert.match(hacking, /admissionPaused/);''',
    '''assert.match(hacking, /maxBoostReady/);
assert.match(hacking, /sameScriptPath\\(proc\\.filename, script\\)/,
    "legacy drain reconstruction must normalize ns.ps H/G/W filenames");
assert.doesNotMatch(hacking, /\\[H, G, W\\]\\.includes\\(proc\\.filename\\)/,
    "MAX drain must not use leading-slash-sensitive legacy matching");
assert.match(hacking, /admissionPaused/);''',
)

Path(".github/workflows/test.yml").write_text('''name: test

on:
  push:
    branches:
      - fix/ram-stage-64
  pull_request:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
''')

Path(".github/apply-legacy-drain-fix.py").unlink()
Path(".github/workflows/workflow-smoke.yml").unlink()
