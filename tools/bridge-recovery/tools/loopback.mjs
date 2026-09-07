import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const file = require.resolve('esbuild-bitburner-plugin');
const original = fs.readFileSync(file, 'utf8');
const before = 'httpServer.listen(port, callback);';
const after = 'httpServer.listen(port, "127.0.0.1", callback);';
if (!original.includes(after)) {
  if (original.split(before).length !== 2) throw new Error('Unsupported Remote API plugin: loopback patch needs review');
  fs.writeFileSync(file, original.replace(before, after));
}
