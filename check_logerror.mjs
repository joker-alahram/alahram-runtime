import fs from 'fs';
import path from 'path';

function findFiles(dir, filesList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file === 'node_modules' || file === '.git' || file === '.gemini') continue;
    const name = path.join(dir, file);
    if (fs.statSync(name).isDirectory()) {
      findFiles(name, filesList);
    } else if (name.endsWith('.js') || name.endsWith('.mjs') || name.endsWith('.ts')) {
      filesList.push(name);
    }
  }
  return filesList;
}

const files = findFiles('d:/new/alahram-runtime');
console.log(`Checking ${files.length} files...`);

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  if (content.includes('logError') && !content.includes("import { logError }") && !content.includes("import {logError}")) {
    // Check if it's defined inside the file itself
    if (!content.includes('function logError') && !content.includes('const logError')) {
      console.log(`❌ File has logError but no import: ${file}`);
    }
  }
}
