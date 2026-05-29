import pg from 'pg';
const pool = new pg.Pool({
  host: 'aws-0-eu-west-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.teffdegicyfdowveqqvw', password: 'Yasser1983@@##',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000,
});
const client = await pool.connect();
try {
  // Check offers table columns properly (not information_schema which includes all types)
  const cols = await client.query("SELECT column_name, udt_name, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='offers' ORDER BY ordinal_position");
  console.log('=== offers columns ===');
  for (const c of cols.rows) {
    console.log(`  ${c.column_name} (${c.udt_name}, nullable=${c.is_nullable})`);
  }

  // Sample offers data
  const offs = await client.query('SELECT id, offer_type, title, offer_price, starts_at, ends_at, is_active, participates_in_tier, execution_priority FROM offers ORDER BY created_at DESC LIMIT 10');
  console.log('\n=== Sample offers ===');
  console.table(offs.rows);

  // Check offer_items
  const oiCols = await client.query("SELECT column_name, udt_name FROM information_schema.columns WHERE table_schema='public' AND table_name='offer_items' ORDER BY ordinal_position");
  console.log('\n=== offer_items columns ===');
  for (const c of oiCols.rows) console.log(`  ${c.column_name} (${c.udt_name})`);

  const oiSample = await client.query('SELECT * FROM offer_items LIMIT 5');
  console.log('\n=== Sample offer_items ===');
  console.table(oiSample.rows);

  // Check products for linking
  const prodSample = await client.query('SELECT id, product_name, product_code FROM products LIMIT 3');
  console.log('\n=== Sample products ===');
  console.table(prodSample.rows);
} finally {
  client.release();
  pool.end();
}
