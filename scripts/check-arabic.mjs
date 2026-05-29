import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

const SRC_DIR = new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]):\//i, '$1:\\');
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git']);
const CHECK_EXTS = new Set(['.js', '.mjs', '.html', '.css', '.json', '.vue', '.svelte']);

let errors = 0;

function walk(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
        walk(join(dir, entry.name));
      }
    } else if (CHECK_EXTS.has(extname(entry.name))) {
      checkFile(join(dir, entry.name));
    }
  }
}

function checkFile(filePath) {
  const buf = readFileSync(filePath);
  const rel = filePath.replace(SRC_DIR, '').replace(/\\/g, '/');

  // Check 1: Detect invalid UTF-8 sequences
  const text = buf.toString('utf8');
  const reparsed = Buffer.from(text, 'utf8');
  if (Buffer.compare(buf, reparsed) !== 0) {
    console.error(`[FAIL] Invalid UTF-8: ${rel}`);
    errors++;
    return;
  }

  // Check 2: Detect replacement character U+FFFD in source strings
  if (text.includes('\uFFFD')) {
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('\uFFFD')) {
        console.error(`[FAIL] U+FFFD (replacement char) at ${rel}:${i + 1}`);
        console.error(`        ${lines[i].trim().slice(0, 120)}`);
        errors++;
      }
    }
  }

  // Check 3: Detect question-mark sequences that suggest mojibake (3+ consecutive ?)
  // But only in string literals to avoid false positives in comments/logic
  const questionMarkSeq = /\?\?\?+/g;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let match;
    while ((match = questionMarkSeq.exec(line)) !== null) {
      const ctx = line.slice(Math.max(0, match.index - 10), match.index + match[0].length + 20);
      console.error(`[WARN] Possible mojibake (${match[0].length} question marks) at ${rel}:${i + 1}`);
      console.error(`        ...${ctx.trim()}...`);
      errors++;
    }
  }
}

console.log('[arabic-check] Scanning for corrupted Arabic/mojibake in source files...');
walk(SRC_DIR);
console.log(`[arabic-check] ${errors > 0 ? `FAILED — ${errors} issue(s) found` : 'PASSED — no issues found'}`);
process.exit(errors > 0 ? 1 : 0);
