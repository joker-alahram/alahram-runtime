import pg from 'pg';
const p = new pg.Pool({connectionString:'postgres://postgres.teffdegicyfdowveqqvw:Yasser1983%40%40%23%23@aws-0-eu-west-1.pooler.supabase.com:6543/postgres'});
const c = await p.connect();
try {
  const r = await c.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='runtime_order_visibility' AND column_name LIKE '%created_by%' ORDER BY ordinal_position");
  console.log(JSON.stringify(r.rows));
} finally { c.release(); p.end(); }
