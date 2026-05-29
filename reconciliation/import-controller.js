// ================================================================
// IMPORT CONTROLLER — Controlled Product Import
// ================================================================
// Reads product_import_review.xlsx (the canonical source)
// Creates new brands, then imports products in batches.
//
// Usage:
//   node reconciliation/import-controller.js --dry-run
//   node reconciliation/import-controller.js --batch 1  (20 products)
//   node reconciliation/import-controller.js --batch 2  (50 products)
//   node reconciliation/import-controller.js --all       (rest)
// ================================================================

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

// ================================================================
// Config
// ================================================================

const CONFIG = {
  baseUrl: 'https://teffdegicyfdowveqqvw.supabase.co/rest/v1',
  authBase: 'https://teffdegicyfdowveqqvw.supabase.co/auth/v1',
  apiKey: 'sb_publishable_LjwmfFbqsPz35tnUB0IddA_jLXPFZR6',
  batch1: 20,
  batch2: 50,
};

const REVIEW_PATH = path.join(__dirname, 'product_import_review.xlsx');

// ================================================================
// Supabase REST helpers
// ================================================================

let _authToken = null;

function restHeaders(prefer) {
  const h = {
    apikey: CONFIG.apiKey,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (_authToken) h['Authorization'] = `Bearer ${_authToken}`;
  if (prefer) h['Prefer'] = prefer;
  return h;
}

async function supabaseFetch(path, opts = {}) {
  const url = `${CONFIG.baseUrl}${path}`;
  const r = await fetch(url, {
    ...opts,
    headers: { ...restHeaders(opts.prefer), ...(opts.headers || {}) },
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`Supabase ${opts.method || 'GET'} ${path} → ${r.status}: ${body.slice(0, 200)}`);
  }
  return r.json();
}

async function supabaseInsert(table, data) {
  return supabaseFetch(`/${table}`, {
    method: 'POST',
    prefer: 'return=representation',
    body: JSON.stringify(data),
  });
}

async function supabaseSelect(table, query) {
  const qs = query ? '?' + new URLSearchParams(query).toString() : '';
  return supabaseFetch(`/${table}${qs}`);
}

// ================================================================
// Auth — try anon first, fallback to service key
// ================================================================

async function ensureAuth() {
  // First try with just anon key (may work for some tables)
  try {
    const r = await supabaseSelect('companies', { select: 'id', limit: '1' });
    console.log('  ✓ anon key works for SELECT');
  } catch (e) {
    console.log('  anon key failed for SELECT:', e.message.slice(0, 60));
  }

  // We'll need service_role key for INSERT. Try known locations.
  const possibleKeys = [
    process.env.SUPABASE_SERVICE_KEY,
    process.env.SUPABASE_KEY,
  ];

  for (const key of possibleKeys) {
    if (key) {
      _authToken = key;
      return;
    }
  }

  // No service key. Try anon for inserts.
  console.log('  Note: No service role key found. Trying anon key for inserts...');
}

// ================================================================
// 1. Read review sheet
// ================================================================

function readReviewSheet() {
  if (!fs.existsSync(REVIEW_PATH)) {
    console.error('ERROR: product_import_review.xlsx not found.');
    process.exit(1);
  }

  const wb = XLSX.readFile(REVIEW_PATH);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

  if (rows.length < 2) {
    console.error('ERROR: Review sheet is empty.');
    process.exit(1);
  }

  const headers = rows[0].map(h => String(h || '').trim());
  const findCol = keyword => {
    const idx = headers.findIndex(h => h.includes(keyword));
    if (idx === -1) console.warn(`Warning: Column "${keyword}" not found in sheet`);
    return idx;
  };

  const col = {
    itemNumber: findCol('كود الصنف'),
    name: findCol('اسم الصنف'),
    brand: findCol('البراند'),
    companyCode: findCol('كود الشركة'),
    category: findCol('التصنيف'),
    cartonQty: findCol('الكرتونة'),
    willImport: findCol('سيتم استيراده'),
  };

  const products = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 2) continue;

    const willImport = String(row[col.willImport] || '').trim();
    if (!willImport.includes('نعم')) continue;

    products.push({
      itemNumber: String(row[col.itemNumber] || '').trim(),
      name: String(row[col.name] || '').trim(),
      brand: String(row[col.brand] || '').trim(),
      companyCode: String(row[col.companyCode] || '').trim(),
      category: String(row[col.category] || '').trim(),
      cartonQty: row[col.cartonQty] ? parseInt(String(row[col.cartonQty]), 10) : null,
    });
  }

  if (products.length === 0) {
    console.log('No products marked for import.');
    process.exit(0);
  }

  return products;
}

// ================================================================
// 2. Get existing companies from DB
// ================================================================

async function getExistingCompanies() {
  const companies = await supabaseSelect('companies', {
    select: 'id,company_code,company_name',
    is_active: 'eq.true',
  });
  console.log(`  DB companies: ${companies.length}`);
  return companies;
}

// ================================================================
// 3. Create new companies
// ================================================================

async function createNewCompanies(products, existingCompanies) {
  const existingCodes = new Set(existingCompanies.map(c => c.company_code));
  const existingNames = new Set(existingCompanies.map(c => c.company_name));

  // Collect unique new brands from products
  const needed = {};
  for (const p of products) {
    if (!p.companyCode) continue;
    if (existingCodes.has(p.companyCode)) continue;
    if (!needed[p.companyCode]) {
      needed[p.companyCode] = {
        company_code: p.companyCode,
        company_name: p.brand,
        products: [],
      };
    }
    needed[p.companyCode].products.push(p.itemNumber);
  }

  const newBrands = Object.values(needed);

  if (newBrands.length === 0) {
    console.log('  No new brands to create.');
    return existingCompanies;
  }

  console.log(`  Creating ${newBrands.length} new brands...`);

  const created = [];
  for (const brand of newBrands) {
    // Check if name already exists under different code
    if (existingNames.has(brand.company_name)) {
      console.log(`    ⚠ Brand "${brand.company_name}" exists with different code — skipping`);
      continue;
    }

    try {
      const result = await supabaseInsert('companies', {
        company_code: brand.company_code,
        company_name: brand.company_name,
        is_active: true,
      });
      created.push(result);
      console.log(`    ✓ ${brand.company_code} → ${brand.company_name} (${brand.products.length} products)`);
    } catch (e) {
      console.error(`    ✗ Failed to create ${brand.company_code}: ${e.message.slice(0, 80)}`);
    }
  }

  // Refresh companies list
  return [...existingCompanies, ...created];
}

// ================================================================
// 4. Import products (batch)
// ================================================================

async function importBatch(products, allCompanies, batchLabel) {
  // Build company_code → id map
  const codeToId = {};
  for (const c of allCompanies) codeToId[c.company_code] = c.id;

  let success = 0;
  let failed = 0;

  for (const p of products) {
    const companyId = p.companyCode ? (codeToId[p.companyCode] || null) : null;

    if (p.companyCode && !companyId) {
      console.log(`  ✗ ${p.itemNumber}: company_code ${p.companyCode} not resolved — skipping`);
      failed++;
      continue;
    }

    const productPayload = {
      product_code: `AUTO-${String(p.itemNumber).padStart(6, '0')}`,
      product_name: p.name,
      company_id: companyId || null,
      company_name_snapshot: p.brand || null,
      category: p.category || null,
      is_active: true,
      track_inventory: true,
      sales_blocked: false,
      barcode: null,
      product_image_url: null,
    };

    try {
      const created = await supabaseInsert('products', productPayload);
      const productId = created.id || created[0]?.id;

      // Create units
      await createProductUnits(productId, p);

      success++;
      if (success % 10 === 0 || success === products.length) {
        process.stdout.write(`  ${batchLabel}: ${success}/${products.length} imported\r`);
      }
    } catch (e) {
      console.error(`\n  ✗ ${p.itemNumber}: ${e.message.slice(0, 120)}`);
      failed++;
    }
  }

  return { success, failed };
}

// ================================================================
// 5. Create product units
// ================================================================

async function createProductUnits(productId, product) {
  const units = [];

  // 1. Base unit: قطعة
  units.push({
    product_id: productId,
    unit_name: 'قطعة',
    unit_code: 'pcs',
    units_per_parent: 1,
    is_base_unit: true,
    is_sellable: true,
    is_active: true,
    base_unit_quantity: 1,
    display_order: 1,
  });

  // 2. Dozen: دستة = 12
  units.push({
    product_id: productId,
    unit_name: 'دستة',
    unit_code: 'dozen',
    units_per_parent: 12,
    is_base_unit: false,
    is_sellable: true,
    is_active: true,
    base_unit_quantity: 12,
    display_order: 2,
  });

  // 3. Carton if present
  if (product.cartonQty && product.cartonQty > 1) {
    units.push({
      product_id: productId,
      unit_name: `كرتونة (${product.cartonQty} قطعة)`,
      unit_code: `ctn_${product.cartonQty}`,
      units_per_parent: product.cartonQty,
      is_base_unit: false,
      is_sellable: true,
      is_active: true,
      base_unit_quantity: product.cartonQty,
      display_order: 3,
    });
  }

  // Insert all units
  for (const unit of units) {
    await supabaseInsert('product_units', unit);
  }
}

// ================================================================
// 6. Main
// ================================================================

async function main() {
  console.log('');
  console.log('═════════════════════════════════════════════');
  console.log('  CONTROLLED PRODUCT IMPORT');
  console.log('═════════════════════════════════════════════\n');

  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');

  // Step 1: Read review sheet
  console.log('1. Reading review sheet...');
  const allProducts = readReviewSheet();
  console.log(`   Products marked for import: ${allProducts.length}`);

  // Step 2: Get existing companies
  console.log('\n2. Fetching existing companies...');
  await ensureAuth();
  let companies;
  try {
    companies = await getExistingCompanies();
  } catch (e) {
    console.error(`   Failed to fetch companies: ${e.message}`);
    console.log('   Trying with anon key only...');
    companies = [];
  }

  // Step 3: Determine batch
  let batchProducts;
  let batchLabel;

  if (args.includes('--batch')) {
    const batchNum = parseInt(args[args.indexOf('--batch') + 1], 10);
    if (batchNum === 1) {
      batchProducts = allProducts.slice(0, CONFIG.batch1);
      batchLabel = `Batch 1 (${batchProducts.length})`;
    } else if (batchNum === 2) {
      batchProducts = allProducts.slice(0, CONFIG.batch1 + CONFIG.batch2);
      batchLabel = `Batch 2 (${batchProducts.length})`;
    } else {
      batchProducts = allProducts;
      batchLabel = 'All';
    }
  } else if (args.includes('--all')) {
    batchProducts = allProducts;
    batchLabel = 'All';
  } else {
    // Default: dry run info
    console.log('\n   No batch specified. Run with:');
    console.log('     --batch 1    Import first 20 products');
    console.log('     --batch 2    Import next 50 products');
    console.log('     --all        Import all remaining');
    console.log('     --dry-run    Preview only\n');

    // Print summary
    console.log('   SUMMARY');
    console.log(`   Products ready: ${allProducts.length}`);
    const brandsNeeded = new Set(allProducts.filter(p => p.companyCode).map(p => p.companyCode));
    console.log(`   Brands needed: ${brandsNeeded.size}`);
    console.log(`   Batch 1: first ${CONFIG.batch1} products`);
    console.log(`   Batch 2: next ${CONFIG.batch2} products (total ${CONFIG.batch1 + CONFIG.batch2})`);
    return;
  }

  if (isDryRun) {
    console.log(`\n3. DRY RUN — ${batchLabel}`);
    console.log('   Would create/verify brands:');
    const codesNeeded = new Set(batchProducts.filter(p => p.companyCode).map(p => p.companyCode));
    for (const code of codesNeeded) {
      const existing = companies.find(c => c.company_code === code);
      console.log(`   ${existing ? '✓ exists' : '✗ CREATE'} → ${code}`);
    }
    console.log(`   Would import: ${batchProducts.length} products`);
    console.log('   (no changes made)');
    return;
  }

  // Step 3: Create new brands
  console.log(`\n3. Setting up brands for ${batchLabel}...`);
  companies = await createNewCompanies(batchProducts, companies);

  // Step 4: Import products
  console.log(`\n4. Importing ${batchLabel}...`);
  const result = await importBatch(batchProducts, companies, batchLabel);

  console.log(`\n\n   ✓ ${batchLabel}: ${result.success} imported, ${result.failed} failed`);

  // Step 5: Summary
  const percent = ((result.success / batchProducts.length) * 100).toFixed(0);
  console.log(`   Success rate: ${percent}%`);

  if (result.success > 0) {
    console.log('\n   NEXT:');
    if (result.success <= CONFIG.batch1) {
      console.log('   └─ Run --batch 2 to import next 50');
    } else if (result.success <= CONFIG.batch1 + CONFIG.batch2) {
      console.log('   └─ Run --all to import remaining');
    } else {
      console.log('   └─ Verify in storefront & dashboard');
    }
  }
}

main().catch(err => {
  console.error('\nFATAL:', err.message);
  process.exit(1);
});
