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

const funcs = await c.query(`
  SELECT p.proname, 
    pg_get_function_identity_arguments(p.oid) AS args,
    pg_get_functiondef(p.oid) AS def
  FROM pg_proc p
  WHERE p.proname IN ('resolve_product_price', 'resolve_product_prices_batch', 'resolve_order_item_price')
  ORDER BY p.proname
`);
for (const r of funcs.rows) {
  console.log('=== ' + r.proname + '(' + r.args + ') ===');
  console.log(r.def?.substring(0, 800));
  console.log('');
}

await c.end();
