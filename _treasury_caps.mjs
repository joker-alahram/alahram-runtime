import pg from 'pg';
const pool = new pg.Pool({
  host: 'aws-0-eu-west-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.teffdegicyfdowveqqvw', password: 'Yasser1983@@##',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000,
});
try {
  const c = await pool.connect();

  // Check capabilities table
  const caps = await c.query("SELECT * FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('capabilities','role_capabilities','employee_capabilities')");
  console.log('=== CAPABILITIES TABLES ===');
  console.log(JSON.stringify(caps.rows));

  try {
    const capData = await c.query("SELECT * FROM capabilities ORDER BY capability_code");
    console.log('\n=== CAPABILITIES DATA ===');
    console.log(JSON.stringify(capData.rows, null, 2));
  } catch(e) { console.log('capabilities table error:', e.message); }

  try {
    const empCaps = await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='employees' AND (column_name LIKE '%cap%' OR column_name LIKE '%treasur%' OR column_name LIKE '%manage%') ORDER BY ordinal_position");
    console.log('\n=== EMPLOYEES CAPABILITY COLUMNS ===');
    console.log(JSON.stringify(empCaps.rows));
  } catch(e) {}

  // Check if runtime_employee_capabilities has treasury
  try {
    const rec = await c.query("SELECT * FROM runtime_employee_capabilities LIMIT 1");
    if (rec.rows.length) {
      console.log('\n=== RUNTIME_EMPLOYEE_CAPABILITIES SAMPLE ===');
      console.log(JSON.stringify(Object.keys(rec.rows[0])));
      console.log(JSON.stringify(rec.rows[0]));
    }
  } catch(e) { console.log('runtime_employee_capabilities error:', e.message); }

  c.release(); await pool.end();
} catch(e) { console.error('ERROR:', e.message); await pool.end(); }
