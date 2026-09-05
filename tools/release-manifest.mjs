import fs from 'node:fs';
import { createHash } from 'node:crypto';
const file = 'manifest.json', manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
const check = process.argv.includes('--check');
for (const entry of manifest.files) {
    const source = fs.readFileSync(entry.path, 'utf8').replace(/\r\n/g, '\n');
    const hash = createHash('sha256').update(source).digest('hex');
    if (check && entry.sha256 !== hash) throw new Error(`stale release checksum: ${entry.path}`);
    entry.sha256 = hash;
}
if (!check) fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Release checksums ${check ? 'verified' : 'generated'}: ${manifest.files.length} files (Git LF).`);
