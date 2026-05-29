import fs from 'fs';
import path from 'path';

const LOGGER_PATH = 'd:/new/alahram-runtime/utils/logger.js';

const FILES_TO_FIX = [
  'd:/new/alahram-runtime/domains/field/pages/visits/detail.js',
  'd:/new/alahram-runtime/domains/ops/pages/customer.js',
  'd:/new/alahram-runtime/domains/ops/pages/customers.js',
  'd:/new/alahram-runtime/domains/ops/pages/reps.js',
  'd:/new/alahram-runtime/domains/storefront/components/activeVisitWorkspace.js',
  'd:/new/alahram-runtime/domains/storefront/pages/home.js',
  'd:/new/alahram-runtime/pwa/installManager.js',
  'd:/new/alahram-runtime/pwa/offlineManager.js',
  'd:/new/alahram-runtime/services/ops/ordersApi.js',
  'd:/new/alahram-runtime/services/runtime/localAuthService.js',
  'd:/new/alahram-runtime/services/storefront/cartApi.js',
  'd:/new/alahram-runtime/services/storefront/pdfService.js',
  'd:/new/alahram-runtime/services/storefront/runtimeContext.js',
  'd:/new/alahram-runtime/services/storefront/visitsApi.js',
];

console.log('Starting logError imports injection...');

for (const filePath of FILES_TO_FIX) {
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️ File does not exist: ${filePath}`);
    continue;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  if (content.includes('logError') && !content.includes('import { logError }') && !content.includes('import {logError}')) {
    const dir = path.dirname(filePath);
    let relPath = path.relative(dir, LOGGER_PATH).replace(/\\/g, '/');
    if (!relPath.startsWith('.')) {
      relPath = './' + relPath;
    }
    const importStmt = `import { logError } from '${relPath}';\n`;
    content = importStmt + content;
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ Injected import into: ${filePath} (relative path: ${relPath})`);
  } else {
    console.log(`ℹ️ File already has import or doesn't need it: ${filePath}`);
  }
}

console.log('All imports injected successfully!');
