import pg from 'pg';
const pool = new pg.Pool({
  host: 'aws-0-eu-west-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.teffdegicyfdowveqqvw', password: 'Yasser1983@@##',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000,
});
const client = await pool.connect();
try {
  // Check existing daily_deals structure (if table exists)
  const tbls = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name IN ('daily_deals','flash_offers')");
  console.log('Tables found:', tbls.rows.map(r => r.table_name));

  if (tbls.rows.length > 0) {
    for (const tbl of tbls.rows) {
      const cols = await client.query(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name='${tbl.table_name}' ORDER BY ordinal_position`);
      console.log(`\n=== ${tbl.table_name} columns ===`);
      console.table(cols.rows);
    }
  }

  // Check for views
  const vws = await client.query("SELECT table_name FROM information_schema.views WHERE table_schema='public' AND table_name LIKE '%deal%' OR table_name LIKE '%flash%'");
  console.log('\nRelevant views:', vws.rows.map(r => r.table_name));

  // Check offers table for deal_type field
  const offCols = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='offers' AND column_name LIKE '%deal%' OR column_name LIKE '%flash%' OR column_name LIKE '%type%'");
  console.log('\nOffers relevant columns:');
  console.table(offCols.rows);

  // Check what dashboard views exist
  const dashViews = await client.query("SELECT table_name FROM information_schema.views WHERE table_schema='public' AND (table_name LIKE '%dashboard%' OR table_name LIKE '%operations%' OR table_name LIKE '%alert%' OR table_name LIKE '%metric%')");
  console.log('\nDashboard/metric views:');
  console.table(dashViews.rows);

  // Check runtime_operations_dashboard if it exists
  const opsDash = await client.query("SELECT * FROM runtime_operations_dashboard LIMIT 10");
  console.log('\nruntime_operations_dashboard:');
  console.table(opsDash.rows);

  // Check dashboard_runtime_stats
  const stats = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='dashboard_runtime_stats' ORDER BY ordinal_position");
  console.log('\ndashboard_runtime_stats columns:');
  console.table(stats.rows);
} finally {
  client.release();
  pool.end();
}
