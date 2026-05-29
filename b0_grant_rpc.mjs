import pg from 'pg';
const { Client } = pg;
const c = new Client({
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  port: 6543, database: 'postgres',
  user: 'postgres.teffdegicyfdowveqqvw',
  password: 'Yasser1983@@##',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});
await c.connect();

// Check RPC permissions
const grants = await c.query(`
  SELECT p.proname, 
    has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_can
  FROM pg_proc p
  WHERE p.proname IN ('resolve_product_price', 'resolve_product_prices_batch', 'resolve_order_item_price')
`);
console.log('Current grants:');
for (const r of grants.rows) {
  console.log(`  ${r.proname}: anon=${r.anon_can} auth=${r.auth_can}`);
}

// Grant EXECUTE to anon and authenticated
for (const fn of ['resolve_product_price', 'resolve_product_prices_batch', 'resolve_order_item_price']) {
  await c.query(`GRANT EXECUTE ON FUNCTION ${fn} TO anon, authenticated`);
  console.log(`Granted EXECUTE on ${fn}`);
}

await c.end();
