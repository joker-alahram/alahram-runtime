import pg from 'pg';
const pool = new pg.Pool({
  host: 'aws-0-eu-west-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.teffdegicyfdowveqqvw', password: 'Yasser1983@@##',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000,
});
try {
  const c = await pool.connect();

  // treasury_transactions columns + sample
  const ttCols = await c.query("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='treasury_transactions' ORDER BY ordinal_position");
  console.log('=== TREASURY_TRANSACTIONS COLUMNS ===');
  console.log(ttCols.rows.map(r => r.column_name + ' (' + r.data_type + ', nullable=' + r.is_nullable + ')').join('\n'));

  const ttSample = await c.query("SELECT * FROM treasury_transactions LIMIT 5");
  console.log('\n=== TREASURY_TRANSACTIONS SAMPLE ===');
  console.log(JSON.stringify(ttSample.rows, null, 2));
  const ttCount = await c.query("SELECT count(*) FROM treasury_transactions");
  console.log('Count:', ttCount.rows[0].count);

  // collections columns + sample
  const colCols = await c.query("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='collections' ORDER BY ordinal_position");
  console.log('\n=== COLLECTIONS COLUMNS ===');
  console.log(colCols.rows.map(r => r.column_name + ' (' + r.data_type + ')').join('\n'));

  const colSample = await c.query("SELECT * FROM collections LIMIT 5");
  console.log('\n=== COLLECTIONS SAMPLE ===');
  console.log(JSON.stringify(colSample.rows, null, 2));
  const colCount = await c.query("SELECT count(*) FROM collections");
  console.log('Count:', colCount.rows[0].count);

  // cashboxes columns + sample
  const cbCols = await c.query("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='cashboxes' ORDER BY ordinal_position");
  console.log('\n=== CASHBOXES COLUMNS ===');
  console.log(cbCols.rows.map(r => r.column_name + ' (' + r.data_type + ')').join('\n'));

  const cbSample = await c.query("SELECT * FROM cashboxes LIMIT 5");
  console.log('\n=== CASHBOXES SAMPLE ===');
  console.log(JSON.stringify(cbSample.rows, null, 2));

  // collection_allocations columns + sample
  const caCols = await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='collection_allocations' ORDER BY ordinal_position");
  console.log('\n=== COLLECTION_ALLOCATIONS COLUMNS ===');
  console.log(caCols.rows.map(r => r.column_name + ' (' + r.data_type + ')').join('\n'));

  // expense_categories
  const ecCols = await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='expense_categories' ORDER BY ordinal_position");
  console.log('\n=== EXPENSE_CATEGORIES COLUMNS ===');
  console.log(ecCols.rows.map(r => r.column_name + ' (' + r.data_type + ')').join('\n'));

  // payment_methods
  const pmCols = await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='payment_methods' ORDER BY ordinal_position");
  console.log('\n=== PAYMENT_METHODS COLUMNS ===');
  console.log(pmCols.rows.map(r => r.column_name + ' (' + r.data_type + ')').join('\n'));
  const pmData = await c.query("SELECT * FROM payment_methods");
  console.log('\n=== PAYMENT_METHODS DATA ===');
  console.log(JSON.stringify(pmData.rows, null, 2));

  // Check roles → capabilities for can_manage_treasury
  const rc = await c.query(`SELECT r.role_code, r.role_name, c.capability_code 
    FROM role_capabilities rc 
    JOIN roles r ON r.id = rc.role_id 
    JOIN capabilities c ON c.id = rc.capability_id 
    WHERE c.capability_code = 'can_manage_treasury'`);
  console.log('\n=== ROLES WITH can_manage_treasury ===');
  console.log(JSON.stringify(rc.rows, null, 2));

  // Check all roles
  const roles = await c.query("SELECT * FROM roles ORDER BY role_code");
  console.log('\n=== ALL ROLES ===');
  console.log(JSON.stringify(roles.rows, null, 2));

  // Check audit_logs table
  const auditCols = await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='audit_logs' ORDER BY ordinal_position");
  console.log('\n=== AUDIT_LOGS COLUMNS ===');
  console.log(auditCols.rows.map(r => r.column_name + ' (' + r.data_type + ')').join('\n'));

  // Check runtime_audit_logs
  try {
    const raCols = await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='runtime_audit_logs' ORDER BY ordinal_position");
    console.log('\n=== RUNTIME_AUDIT_LOGS COLUMNS ===');
    console.log(raCols.rows.map(r => r.column_name + ' (' + r.data_type + ')').join('\n'));
  } catch(e) {}

  // Check system_events
  const seCols = await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='system_events' ORDER BY ordinal_position");
  console.log('\n=== SYSTEM_EVENTS COLUMNS ===');
  console.log(seCols.rows.map(r => r.column_name + ' (' + r.data_type + ')').join('\n'));

  // Check runtime_events
  const reCols = await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='runtime_events' ORDER BY ordinal_position");
  console.log('\n=== RUNTIME_EVENTS COLUMNS ===');
  console.log(reCols.rows.map(r => r.column_name + ' (' + r.data_type + ')').join('\n'));

  // Check custody_records
  const crCols = await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='custody_records' ORDER BY ordinal_position");
  console.log('\n=== CUSTODY_RECORDS COLUMNS ===');
  console.log(crCols.rows.map(r => r.column_name + ' (' + r.data_type + ')').join('\n'));

  // Check customer_accounts
  const ca2Cols = await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='customer_accounts' ORDER BY ordinal_position");
  console.log('\n=== CUSTOMER_ACCOUNTS COLUMNS ===');
  console.log(ca2Cols.rows.map(r => r.column_name + ' (' + r.data_type + ')').join('\n'));

  c.release(); await pool.end();
} catch(e) { console.error('ERROR:', e.message); await pool.end(); }
