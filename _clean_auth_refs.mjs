import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

const ROOT = 'D:/new/alahram-runtime';
const DIRS = ['auth', 'services', 'domains', 'pwa'];

const FILES = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (extname(p) === '.js') FILES.push(p);
  }
}

for (const d of DIRS) walk(join(ROOT, d));

// Also include root-level files we explicitly need
FILES.push(join(ROOT, 'registry.js'));

let cleaned = 0;

for (const f of FILES) {
  let content = readFileSync(f, 'utf8');
  const before = content;

  // Remove all variants of the accessToken Authorization pattern
  content = content.replace(/^\s*if\s*\(\s*s\??\.auth\?\.accessToken\s*\)\s*\w+\s*\.\s*Authorization\s*=\s*(`Bearer\s*\$\{s\.auth\.accessToken\}`|'Bearer '\s*\+\s*s\.auth\.accessToken)\s*;?\s*$/gm, '');

  if (content !== before) {
    writeFileSync(f, content, 'utf8');
    cleaned++;
    console.log(`CLEANED: ${f}`);
  }
}

console.log(`\nCleaned ${cleaned} files.`);
