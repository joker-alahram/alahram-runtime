import pg from 'pg';
const pool = new pg.Pool({
  host: 'aws-0-eu-west-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.teffdegicyfdowveqqvw', password: 'Yasser1983@@##',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000,
});
(async () => {
  const c = await pool.connect();
  try {
    // Offers columns
    const cols = await c.query(`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'offers' ORDER BY ordinal_position
    `);
    console.log('=== OFFERS COLUMNS ===');
    for (const col of cols.rows) console.log(`  ${col.column_name} (${col.data_type})`);

    // Active offers
    const offers = await c.query('SELECT * FROM offers WHERE is_active = true ORDER BY created_at DESC LIMIT 10');
    console.log(`\n=== ACTIVE OFFERS (${offers.rows.length}) ===`);
    for (const o of offers.rows) {
      console.log(`  ${o.id} | ${o.title || o.offer_name || 'no name'} | type=${o.offer_type} | active=${o.is_active}`);
    }

    // Check if there are any daily deal or flash offer products
    const dp = await c.query("SELECT * FROM information_schema.columns WHERE table_name = 'products' AND (column_name LIKE '%offer%' OR column_name LIKE '%deal%' OR column_name LIKE '%flash%')");
    console.log(`\n=== PRODUCT OFFER COLUMNS ===`);
    for (const col of dp.rows) console.log(`  ${col.column_name}`);

    // Check daily_deal table or similar
    const tables = await c.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND (table_name LIKE '%deal%' OR table_name LIKE '%offer%' OR table_name LIKE '%flash%')
    `);
    console.log(`\n=== OFFER-RELATED TABLES ===`);
    for (const t of tables.rows) console.log(`  ${t.table_name}`);

  } finally { c.release(); pool.end(); }
})().catch(e => { console.error(e); pool.end(); });
