import pg from 'pg';
const pool = new pg.Pool({
  host: 'aws-0-eu-west-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.teffdegicyfdowveqqvw', password: 'Yasser1983@@##',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000,
});
try {
  const c = await pool.connect();

  // 1. ALL public tables
  const allTables = await c.query("SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name");
  console.log('=== ALL PUBLIC TABLES ===');
  console.log(allTables.rows.map(r => r.table_name).join('\n'));

  // 2. ALL views
  const views = await c.query("SELECT table_name FROM information_schema.views WHERE table_schema = 'public' ORDER BY table_name");
  console.log('\n=== ALL PUBLIC VIEWS ===');
  console.log(views.rows.map(r => r.table_name).join('\n'));

  // 3. ALL functions (public)
  const funcs = await c.query("SELECT proname FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE n.nspname='public' AND p.proname NOT LIKE 'pgroonga%' AND p.proname NOT LIKE 'pg_%' ORDER BY proname");
  console.log('\n=== ALL PUBLIC FUNCTIONS ===');
  console.log(funcs.rows.map(r => r.proname).join('\n'));

  // 4. Search treasury-related tables
  const keywords = ['treasury','cash','payment','collection','receipt','expense','transaction','safe','vault','financial','fund'];
  for (const kw of keywords) {
    const tbl = await c.query("SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = 'public' AND LOWER(table_name) LIKE '%" + kw + "%'");
    if (tbl.rows.length) console.log('\n=== KEYWORD: ' + kw + ' ===\n' + tbl.rows.map(r => r.table_name + ' (' + r.table_type + ')').join('\n'));
  }

  // 5. Key tables columns
  const keyTables = ['orders','order_items','visits','invoices','invoice_items','customers','employees','collections','payments','receipts','expenses'];
  for (const t of keyTables) {
    try {
      const cols = await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='" + t + "' ORDER BY ordinal_position");
      if (cols.rows.length) {
        console.log('\n=== ' + t.toUpperCase() + ' ===');
        console.log(cols.rows.map(r => '  ' + r.column_name + ' (' + r.data_type + ')').join('\n'));
      }
    } catch(e) {}
  }

  // 6. Runtime views definitions
  const runtimeViews = ['runtime_employee_capabilities','runtime_order_visibility','runtime_customer_visibility','runtime_visits_with_maps','runtime_operations_dashboard','runtime_product_prices'];
  for (const v of runtimeViews) {
    try {
      const def = await c.query("SELECT pg_get_viewdef('" + v + "'::regclass)");
      console.log('\n=== ' + v + ' ===');
      console.log(def.rows[0]?.pg_get_viewdef?.substring(0, 1000));
    } catch(e) { console.log(v + ': not found'); }
  }

  c.release(); await pool.end();
} catch(e) { console.error('ERROR:', e.message); await pool.end(); }
