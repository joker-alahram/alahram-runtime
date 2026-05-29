import { createServer } from 'vite';
import { chromium } from 'playwright';
import pg from 'pg';

const PORT = 5240;
const s = await createServer({ root: '.', logLevel: 'silent', server: { port: PORT, host: '127.0.0.1', strictPort: true } });
await s.listen();

// DB connection
const pool = new pg.Pool({
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  port: 6543, database: 'postgres',
  user: 'postgres.teffdegicyfdowveqqvw',
  password: 'Yasser1983@@##',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

const b = await chromium.launch({ headless: true, executablePath: 'C:\\Users\\ahram\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe' });
const p = await (await b.newContext()).newPage();
const logs = [];
p.on('console', msg => logs.push(msg.text()));

let passed = 0;
let failed = 0;

function check(desc, cond) {
  if (cond) { passed++; console.log(`  ✅ ${desc}`); }
  else { failed++; console.log(`  ❌ ${desc}`); }
}

// 1. Guest pricing
// logs already accumulating from page creation
await p.goto(`http://127.0.0.1:${PORT}/#home`, { waitUntil: 'networkidle' });
await p.waitForTimeout(3000);
console.log('\n=== B1: Guest Pricing ===');
const guestOk = logs.some(l => l.includes('_lazyHomePrices: RPC ok'));
check('Guest: RPC returns pricing', guestOk);
const guestNoFail = logs.filter(l => l.includes('RPC failed')).length === 0;
check('Guest: no RPC failures', guestNoFail);

// 2. Customer login + tier pricing
logs.length = 0;
await p.evaluate(() => window.location.hash = '#login');
await p.waitForTimeout(1000);
await (await p.waitForSelector('#v2-le')).fill('01066197099');
await (await p.waitForSelector('#v2-lp')).fill('test123456');
await (await p.waitForSelector('#v2-ls')).click();
await p.waitForTimeout(4000);

const custLog = logs.filter(l => l.includes('[runtime]'));
console.log('\n=== B1: Customer (اختبار التشغيل الآلي) Pricing ===');
const custOk = logs.some(l => l.includes('_lazyHomePrices: RPC ok'));
check('Customer: RPC returns pricing', custOk);
const custNoFail = logs.filter(l => l.includes('RPC failed')).length === 0;
check('Customer: no RPC failures', custNoFail);

// 3. Verify customer is authenticated with correct profile
const authTrace = custLog.find(l => l.includes('resolveProfile → customer'));
check('Customer: profile resolved as customer', !!authTrace);
const tierTrace = custLog.find(l => l.includes('roleCode: CUSTOMER'));
check('Customer: roleCode CUSTOMER', !!tierTrace);

// 4. DB-level verification: customer has tier assigned
const dbClient = await pool.connect();
try {
  const cust = await dbClient.query(`SELECT c.id, ct.tier_id, t.tier_name, t.tier_code FROM customers c JOIN customer_tier_assignments ct ON c.id = ct.customer_id AND ct.is_active = true JOIN pricing_tiers t ON ct.tier_id = t.id WHERE c.id = (SELECT ra.actor_id FROM runtime_actors ra JOIN runtime_users u ON ra.user_id = u.id WHERE u.phone = '01066197099' AND ra.actor_type = 'customer')`);
  check('Customer has active tier in DB', cust.rows.length > 0);
  if (cust.rows.length) {
    console.log(`   Tier: ${cust.rows[0].tier_name} (${cust.rows[0].tier_code})`);
  }

  // 5. RPC returns tier-resolved prices at DB level
  const rpc = await dbClient.query(
    `SELECT * FROM resolve_product_prices_batch('5c844258-ce66-4ff3-b663-3e1b0a1a476c'::uuid, ARRAY['0052079a-e33f-4846-8d10-16651ffc4590'::uuid])`
  );
  check('RPC returns tier-resolved prices', rpc.rows.length > 0);
  if (rpc.rows.length) {
    console.log(`   Example: base=${rpc.rows[0].base_price}, final=${rpc.rows[0].final_price}, tier=${rpc.rows[0].tier_name}`);
  }

  // 6. Verify runtime_product_prices view has the tier data
  const rpp = await dbClient.query(`
    SELECT DISTINCT tier_name FROM runtime_product_prices WHERE tier_name IS NOT NULL ORDER BY tier_name
  `);
  console.log('   Tiers in view:', rpp.rows.map(r => r.tier_name).join(', '));
} finally {
  dbClient.release();
}

// Summary
console.log(`\n=== Phase B Results ===`);
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);

await b.close(); await s.close();
pool.end();
