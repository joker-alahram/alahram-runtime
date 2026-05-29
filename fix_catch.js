const fs = require('fs');
const path = require('path');
const LOG_FILE = 'fix_catch.log';
function log(message) { fs.appendFileSync(LOG_FILE, message + '\n'); }
function processFile(file) {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;
  // Replace empty catch (e) { logError('silent catch', e); throw e; } with catch (e) { logError('silent catch', e); throw e; }
  const emptyCatchRegex = /catch\s*\{\s*\}/g;
  content = content.replace(emptyCatchRegex, "catch (e) { logError('silent catch', e); throw e; }");
  // Replace catch (e) { logError('silent catch', e); throw e; } with logging
  const emptyCatchVarRegex = /catch\s*\(([^)]+)\)\s*\{\s*\}/g;
  content = content.replace(emptyCatchVarRegex, (match, p1) => `catch (${p1}) { logError('silent catch', ${p1}); throw ${p1}; }`);
  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    log(`Updated ${file}`);
  }
}
function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      walk(full);
    } else if (entry.isFile() && full.endsWith('.js')) {
      processFile(full);
    }
  }
}
walk('d:/new/alahram-runtime');
console.log('Catch block cleanup completed.');
