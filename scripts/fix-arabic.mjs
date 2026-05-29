import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const SRC = new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]):\//i, '$1:\\');
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'scripts']);

function buildW1256Map() {
  const dec = new TextDecoder('windows-1256');
  const toByte = {};
  const arabicIn3ByteRange = new Set();
  for (let b = 0; b <= 0xFF; b++) {
    const c = dec.decode(new Uint8Array([b]));
    if (c && c.length === 1) {
      const cp = c.charCodeAt(0);
      toByte[cp] = b;
      if (b >= 0xE0 && b <= 0xEF && cp >= 0x0600 && cp <= 0x06FF) {
        arabicIn3ByteRange.add(cp);
      }
    }
  }
  const decL1 = new TextDecoder('latin1');
  for (let b = 0; b <= 0xFF; b++) {
    const c = decL1.decode(new Uint8Array([b]));
    if (c && c.length === 1 && toByte[c.charCodeAt(0)] === undefined) {
      toByte[c.charCodeAt(0)] = b;
    }
  }
  return { toByte, arabicIn3ByteRange };
}

function fixText(text, { toByte, arabicIn3ByteRange }) {
  const chars = [...text];
  const out = [];
  let i = 0;
  let fixed2 = 0, fixed3 = 0, fixed4 = 0;

  while (i < chars.length) {
    const cp = chars[i].charCodeAt(0);
    const b1 = toByte[cp];

    // Try 4-byte fix (emoji, SMP chars)
    if (b1 !== undefined && b1 >= 0xF0 && b1 <= 0xF4 && i + 3 < chars.length) {
      const b2 = toByte[chars[i + 1].charCodeAt(0)];
      const b3 = toByte[chars[i + 2].charCodeAt(0)];
      const b4 = toByte[chars[i + 3].charCodeAt(0)];
      if (b2 !== undefined && b3 !== undefined && b4 !== undefined &&
          b2 >= 0x80 && b2 <= 0xBF && b3 >= 0x80 && b3 <= 0xBF && b4 >= 0x80 && b4 <= 0xBF) {
        const quad = new Uint8Array([b1, b2, b3, b4]);
        const decoded = new TextDecoder('utf-8').decode(quad);
        const cp4 = decoded.codePointAt(0);
        if (cp4 !== undefined && cp4 > 0xFFFF) {
          out.push(decoded);
          i += 4;
          fixed4++;
          continue;
        }
      }
    }

    // Try 3-byte fix
    if (b1 !== undefined && b1 >= 0xE0 && b1 <= 0xEF &&
        !arabicIn3ByteRange.has(cp) && i + 2 < chars.length) {
      const b2 = toByte[chars[i + 1].charCodeAt(0)];
      const b3 = toByte[chars[i + 2].charCodeAt(0)];
      if (b2 !== undefined && b3 !== undefined &&
          b2 >= 0x80 && b2 <= 0xBF && b3 >= 0x80 && b3 <= 0xBF) {
        const triple = new Uint8Array([b1, b2, b3]);
        const decoded = new TextDecoder('utf-8').decode(triple);
        if (decoded.length === 1) {
          const dc = decoded.charCodeAt(0);
          if ((dc >= 0x2000 && dc <= 0x206F) ||  // General punctuation
              (dc >= 0x2100 && dc <= 0x214F) ||  // Letterlike symbols
              (dc >= 0x2190 && dc <= 0x21FF) ||  // Arrows
              (dc >= 0x2200 && dc <= 0x22FF) ||  // Math operators
              (dc >= 0x2500 && dc <= 0x25FF) ||  // Box drawing, blocks, geometric
              (dc >= 0x2600 && dc <= 0x26FF) ||  // Miscellaneous symbols
              (dc >= 0x2B00 && dc <= 0x2BFF) ||  // Misc symbols and arrows
              (dc >= 0x2300 && dc <= 0x23FF)) {  // Miscellaneous technical
            out.push(decoded);
            i += 3;
            fixed3++;
            continue;
          }
        }
      }
    }

    // Try 2-byte fix
    if (b1 !== undefined && b1 >= 0xC2 && b1 <= 0xDF && i + 1 < chars.length) {
      const b2 = toByte[chars[i + 1].charCodeAt(0)];
      if (b2 !== undefined && b2 >= 0x80 && b2 <= 0xBF) {
        const pair = new Uint8Array([b1, b2]);
        const decoded = new TextDecoder('utf-8').decode(pair);
        if (decoded.length === 1) {
          const dc = decoded.charCodeAt(0);
          if (dc >= 0x0600 && dc <= 0x06FF) {
            out.push(decoded);
            i += 2;
            fixed2++;
            continue;
          }
        }
      }
    }

    out.push(chars[i]);
    i++;
  }

  return { text: out.join(''), fixed2, fixed3, fixed4 };
}

function fixFile(fp, map) {
  try {
    const orig = readFileSync(fp, 'utf8');
    if (orig.length < 100) return;
    // Quick check: does file have non-ASCII?
    if (!/[\x80-\xFF\u0600-\u06FF]/.test(orig)) return;

    const result = fixText(orig, map);
    if (result.fixed2 > 0 || result.fixed3 > 0 || result.fixed4 > 0) {
      const rel = fp.replace(SRC, '').replace(/\\/g, '/');
      console.log(`[FIX] ${rel}: 2b=${result.fixed2} 3b=${result.fixed3} 4b=${result.fixed4}`);
      writeFileSync(fp, result.text, 'utf8');
    }
  } catch (e) {
    console.error(`[ERR] ${fp}: ${e.message}`);
  }
}

function walk(dir, map) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(join(dir, e.name), map);
    } else if (e.name.endsWith('.js') || e.name.endsWith('.mjs')) {
      fixFile(join(dir, e.name), map);
    }
  }
}

const map = buildW1256Map();
console.log('[fix-arabic] Fixing 2/3/4-byte Arabic corruption...');
walk(SRC, map);
console.log('[fix-arabic] Done');
