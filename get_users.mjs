import pg from 'pg';
const pool = new pg.Pool({
  connectionString: 'postgres://postgres.teffdegicyfdowveqqvw:Yasser1983%40%40%23%23@aws-0-eu-west-1.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

try {
  const phones = ['201066197010', '201220800258', '201030108501', '201002082831', '201004466887', '201066190000', '201069328266'];
  const emails = phones.map(p => `${p}@internal.local`);

  const res = await pool.query(`
    SELECT id, email, encrypted_password, email_confirmed_at, phone, raw_user_meta_data
    FROM auth.users
    WHERE email = ANY($1)
  `, [emails]);

  console.log('=== AUTH.USERS IN DATABASE ===');
  console.log(JSON.stringify(res.rows, null, 2));
} catch (e) {
  console.error('ERROR:', e.message);
} finally {
  await pool.end();
}
